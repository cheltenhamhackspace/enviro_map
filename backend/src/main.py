import logging
import boto3
import json
import os
import time
import random

session = boto3.Session(region_name=os.environ["REGION"])
dynamodb_client = session.client("dynamodb")


def lambda_handler(event, context):
    try:
        print("event ->" + str(event))
        if event["body"] != None:
            payload = json.loads(event["body"])
            print("payload ->" + str(payload))
        if event["httpMethod"] == "POST" and payload != None:
            dynamodb_response = dynamodb_client.put_item(
                TableName=os.environ["READINGS_TABLE"],
                Item={
                    "DeviceId": {"S": str(payload["DeviceId"])},
                    "EventTime": {"N": str(int(time.time()))},
                    "RelativeHumidity": {"N": str(payload["RelativeHumidity"])},
                    "Temperature": {"N": str(payload["Temperature"])},
                    "PM1": {"N": str(payload["PM1"])},
                    "PM2_5": {"N": str(payload["PM2_5"])},
                    "PM4": {"N": str(payload["PM4"])},
                    "PM10": {"N": str(payload["PM10"])},
                    "VOC": {"N": str(payload["VOC"])},
                    "NOx": {"N": str(payload["NOx"])},
                },
            )
            print(dynamodb_response)
            return {"statusCode": 201, "headers": {"Access-Control-Allow-Origin": "*"}}
        elif (
            event["httpMethod"] == "GET"
            and event["resource"] == "/sensor/{sensorid}"
            and event["pathParameters"]["sensorid"] != None
        ):
            sensorid = event["pathParameters"]["sensorid"]
            print("sensorid: " + str(sensorid))
            dynamodb_response = dynamodb_client.query(
                TableName=os.environ["READINGS_TABLE"],
                KeyConditionExpression="DeviceId = :deviceid AND EventTime >= :event_time",
                ExpressionAttributeValues={
                    ":deviceid": {"S": str(sensorid)},
                    ":event_time": {"N": str(int(time.time() - 86400))},
                },
            )
            # times = [i["EventTime"]["N"] for i in dynamodb_response["Items"]]
            # readings = [i[reading_type]["N"] for i in dynamodb_response["Items"]]
            # response = {"times": times, "readings": readings}

            response = {
                "time": [],
                "PM1": [],
                "PM2_5": [],
                "PM4": [],
                "PM10": [],
                "VOC": [],
                "NOx": [],
            }
            for item in dynamodb_response["Items"]:
                response["time"].append(float(item["EventTime"]["N"]) * 1000)
                response["PM1"].append(item["PM1"]["N"])
                response["PM2_5"].append(item["PM2_5"]["N"])
                response["PM4"].append(item["PM4"]["N"])
                response["PM10"].append(item["PM10"]["N"])
                response["VOC"].append(item["VOC"]["N"])
                response["NOx"].append(item["NOx"]["N"])

            if len(response["time"]) > 0:
                return {
                    "statusCode": 200,
                    "headers": {"Access-Control-Allow-Origin": "*"},
                    "body": str(json.dumps(response)),
                }
            else:
                return {
                    "statusCode": 404,
                    "headers": {"Access-Control-Allow-Origin": "*"},
                }
        elif event["httpMethod"] == "GET" and event["resource"] == "/sensors":
            dynamodb_response = dynamodb_client.scan(
                TableName=os.environ["SENSORS_TABLE"],
            )
            print("RESPONSE -> " + str(dynamodb_response))
            response = []
            for item in dynamodb_response["Items"]:
                response.append(
                    {
                        "name": item["DeviceName"]["S"],
                        "uuid": item["DeviceId"]["S"],
                        "location": [item["Lat"]["N"], item["Lon"]["N"]],
                    }
                )
            if len(response) > 0:
                return {
                    "statusCode": 200,
                    "headers": {"Access-Control-Allow-Origin": "*"},
                    "body": str(json.dumps(response)),
                }
            else:
                return {
                    "statusCode": 404,
                    "headers": {"Access-Control-Allow-Origin": "*"},
                }
        else:
            return {"statusCode": 500, "body": '{"status":"Server error"}'}
    except Exception as e:
        logging.error(e)
        return {
            "statusCode": 500,
            "headers": {"Access-Control-Allow-Origin": "*"},
            "body": '{"status":"Server error"}',
        }
