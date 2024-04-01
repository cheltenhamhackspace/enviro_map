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
    }
  }
}

resource "aws_api_gateway_rest_api" "web_api" {
  name        = "enviro-map-web-api"
  description = "Environment Map API"
}

resource "aws_api_gateway_resource" "root" {
  rest_api_id = aws_api_gateway_rest_api.web_api.id
  parent_id   = aws_api_gateway_rest_api.web_api.root_resource_id
  path_part   = "sensor"
}

resource "aws_api_gateway_resource" "sensorid" {
  rest_api_id = aws_api_gateway_rest_api.web_api.id
  parent_id   = aws_api_gateway_resource.root.id
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
  resource_id   = aws_api_gateway_resource.root.id
  http_method   = "POST"
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
  resource_id = aws_api_gateway_resource.root.id
  http_method = aws_api_gateway_method.sensor_post.http_method

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

  source_arn = "${aws_api_gateway_rest_api.web_api.execution_arn}/*/${aws_api_gateway_method.sensor_post.http_method}${aws_api_gateway_resource.root.path}"
}

resource "aws_lambda_permission" "sensor_get" {
  statement_id  = "AllowAPIGatewayInvoke_sensor_get"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.lambda.function_name
  principal     = "apigateway.amazonaws.com"

  source_arn = "${aws_api_gateway_rest_api.web_api.execution_arn}/*/${aws_api_gateway_method.sensor_get.http_method}${aws_api_gateway_resource.reading_type.path}"
}

# The Deploy stage of the API.
resource "aws_api_gateway_deployment" "example" {
  depends_on = [aws_api_gateway_integration.sensor_get, aws_api_gateway_integration.sensor_post]

  rest_api_id = aws_api_gateway_rest_api.web_api.id
  stage_name  = "v1"
  description = "This is a test"

  variables = {
    "lambdaFunctionName" = "${aws_lambda_function.lambda.function_name}"
  }
}
