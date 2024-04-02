terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4.2"
    }
  }
}

# Configure the AWS Provider
provider "aws" {
  region = "eu-west-1"
}

provider "aws" {
  region = "us-east-1"
  alias  = "us-east-1"
}

resource "aws_dynamodb_table" "sensor_readings" {
  name         = "SensorReadings"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "DeviceId"
  range_key    = "EventTime"

  attribute {
    name = "DeviceId"
    type = "S"
  }

  attribute {
    name = "EventTime"
    type = "N"
  }

  tags = {
    Name        = "dynamodb-table-1"
    Environment = "production"
  }
}

resource "aws_dynamodb_table" "sensors" {
  name         = "Sensors"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "DeviceId"
  range_key    = "DeviceName"

  attribute {
    name = "DeviceId"
    type = "S"
  }

  attribute {
    name = "DeviceName"
    type = "S"
  }

  attribute {
    name = "Lat"
    type = "N"
  }

  attribute {
    name = "Lon"
    type = "N"
  }

  global_secondary_index {
    name            = "SensorLocationIndex"
    hash_key        = "Lat"
    range_key       = "Lon"
    projection_type = "ALL"
  }

  tags = {
    Name        = "dynamodb-table-2"
    Environment = "production"
  }
}



data "archive_file" "lambda" {
  type        = "zip"
  source_file = "src/main.py"
  output_path = "src/lambda.zip"
}

data "aws_iam_policy_document" "assume_role" {
  statement {
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }

    actions = ["sts:AssumeRole"]

  }
}

resource "aws_iam_role" "lambda_role" {
  name               = "enviro-map-lambda-exec-role"
  assume_role_policy = data.aws_iam_policy_document.assume_role.json
}

resource "aws_iam_role_policy" "lambda" {
  name = "enviro-map-lambda-permissions"
  role = aws_iam_role.lambda_role.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "dynamodb:PutItem",
        ]
        Effect   = "Allow"
        Resource = "*"
      },
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_policy" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "lambda_dynamoroles" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess"
}

resource "aws_cloudwatch_log_group" "lambda_log_group" {
  name = "/aws/lambda/${aws_lambda_function.lambda.function_name}"

  retention_in_days = 7
}

resource "aws_lambda_function" "lambda" {
  depends_on    = [aws_iam_role.lambda_role]
  filename      = data.archive_file.lambda.output_path
  function_name = "enviro-map-ingest"
  role          = aws_iam_role.lambda_role.arn

  source_code_hash = data.archive_file.lambda.output_base64sha256

  handler       = "main.lambda_handler"
  runtime       = "python3.12"
  timeout       = "5"
  memory_size   = "128"
  architectures = ["arm64"]
  environment {
    variables = {
      REGION         = "eu-west-1"
      READINGS_TABLE = aws_dynamodb_table.sensor_readings.name
      SENSORS_TABLE  = aws_dynamodb_table.sensors.name
    }
  }
}

resource "aws_api_gateway_rest_api" "web_api" {
  name        = "enviro-map-web-api"
  description = "Environment Map API"
}

resource "aws_api_gateway_resource" "sensor" {
  rest_api_id = aws_api_gateway_rest_api.web_api.id
  parent_id   = aws_api_gateway_rest_api.web_api.root_resource_id
  path_part   = "sensor"
}

resource "aws_api_gateway_resource" "sensors" {
  rest_api_id = aws_api_gateway_rest_api.web_api.id
  parent_id   = aws_api_gateway_rest_api.web_api.root_resource_id
  path_part   = "sensors"
}

resource "aws_api_gateway_resource" "sensorid" {
  rest_api_id = aws_api_gateway_rest_api.web_api.id
  parent_id   = aws_api_gateway_resource.sensor.id
  path_part   = "{sensorid}"
}

resource "aws_api_gateway_resource" "reading_type" {
  rest_api_id = aws_api_gateway_rest_api.web_api.id
  parent_id   = aws_api_gateway_resource.sensorid.id
  path_part   = "{reading_type}"
}

# Define a GET method on the above resource.
resource "aws_api_gateway_method" "sensor_post" {
  rest_api_id   = aws_api_gateway_rest_api.web_api.id
  resource_id   = aws_api_gateway_resource.sensor.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "sensors_get" {
  rest_api_id   = aws_api_gateway_rest_api.web_api.id
  resource_id   = aws_api_gateway_resource.sensors.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "sensor_get" {
  rest_api_id   = aws_api_gateway_rest_api.web_api.id
  resource_id   = aws_api_gateway_resource.reading_type.id
  http_method   = "GET"
  authorization = "NONE"
}

# Connect the Lambda function to the GET method via an integration.
resource "aws_api_gateway_integration" "sensor_post" {
  rest_api_id = aws_api_gateway_rest_api.web_api.id
  resource_id = aws_api_gateway_resource.sensor.id
  http_method = aws_api_gateway_method.sensor_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.lambda.invoke_arn
}

resource "aws_api_gateway_integration" "sensors_get" {
  rest_api_id = aws_api_gateway_rest_api.web_api.id
  resource_id = aws_api_gateway_resource.sensors.id
  http_method = aws_api_gateway_method.sensors_get.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.lambda.invoke_arn
}

resource "aws_api_gateway_integration" "sensor_get" {
  rest_api_id = aws_api_gateway_rest_api.web_api.id
  resource_id = aws_api_gateway_resource.reading_type.id
  http_method = aws_api_gateway_method.sensor_get.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.lambda.invoke_arn
}

# Allow the API to trigger the Lambda function.
resource "aws_lambda_permission" "sensor_post" {
  statement_id  = "AllowAPIGatewayInvoke_sensor_post"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.lambda.function_name
  principal     = "apigateway.amazonaws.com"

  source_arn = "${aws_api_gateway_rest_api.web_api.execution_arn}/*/${aws_api_gateway_method.sensor_post.http_method}${aws_api_gateway_resource.sensor.path}"
}

resource "aws_lambda_permission" "sensors_get" {
  statement_id  = "AllowAPIGatewayInvoke_sensors_get"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.lambda.function_name
  principal     = "apigateway.amazonaws.com"

  source_arn = "${aws_api_gateway_rest_api.web_api.execution_arn}/*/${aws_api_gateway_method.sensors_get.http_method}${aws_api_gateway_resource.sensors.path}"
}

resource "aws_lambda_permission" "sensor_get" {
  statement_id  = "AllowAPIGatewayInvoke_sensor_get"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.lambda.function_name
  principal     = "apigateway.amazonaws.com"

  source_arn = "${aws_api_gateway_rest_api.web_api.execution_arn}/*/${aws_api_gateway_method.sensor_get.http_method}${aws_api_gateway_resource.reading_type.path}"
}

# The Deploy stage of the API.
resource "aws_api_gateway_deployment" "sensor_api" {
  depends_on = [aws_api_gateway_integration.sensor_get, aws_api_gateway_integration.sensors_get, aws_api_gateway_integration.sensor_post]

  rest_api_id = aws_api_gateway_rest_api.web_api.id
  stage_name  = "v1"
  description = "This is a test"

  variables = {
    "lambdaFunctionName" = "${aws_lambda_function.lambda.function_name}"
  }
}

data "aws_route53_zone" "api_base_domain" {
  name         = "ntf.systems"
  private_zone = false
}

resource "aws_acm_certificate" "api_base_domain_certificate" {
  provider          = aws.us-east-1
  domain_name       = "api.ntf.systems"
  validation_method = "DNS"
}

resource "aws_route53_record" "api_validation" {
  for_each = {
    for dvo in aws_acm_certificate.api_base_domain_certificate.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = data.aws_route53_zone.api_base_domain.zone_id
}

resource "aws_acm_certificate_validation" "sensor_api" {
  provider                = aws.us-east-1
  depends_on              = [aws_route53_record.api_validation]
  certificate_arn         = aws_acm_certificate.api_base_domain_certificate.arn
  validation_record_fqdns = [for record in aws_route53_record.api_validation : record.fqdn]
}

resource "aws_api_gateway_domain_name" "sensor_api_domain" {
  certificate_arn = aws_acm_certificate_validation.sensor_api.certificate_arn
  domain_name     = aws_acm_certificate.api_base_domain_certificate.domain_name
}

resource "aws_route53_record" "api" {
  name    = aws_api_gateway_domain_name.sensor_api_domain.domain_name
  type    = "A"
  zone_id = data.aws_route53_zone.api_base_domain.zone_id

  alias {
    name                   = aws_api_gateway_domain_name.sensor_api_domain.cloudfront_domain_name
    zone_id                = aws_api_gateway_domain_name.sensor_api_domain.cloudfront_zone_id
    evaluate_target_health = false
  }
}

resource "aws_api_gateway_base_path_mapping" "mapping" {
  api_id      = aws_api_gateway_rest_api.web_api.id
  domain_name = aws_api_gateway_domain_name.sensor_api_domain.domain_name
}
