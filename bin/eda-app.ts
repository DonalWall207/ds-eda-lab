#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { EDAAppStack } from "../lib/eda-app-stack";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdanode from "aws-cdk-lib/aws-lambda-nodejs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as events from "aws-cdk-lib/aws-lambda-event-sources";

const app = new cdk.App();
const edaStack = new EDAAppStack(app, "EDAStack", {
  env: { region: "eu-west-1" },
});

// Queue definition
const imageProcessQueue = new sqs.Queue(edaStack, "img-created-queue", {
  receiveMessageWaitTime: cdk.Duration.seconds(10),
});

// SNS Topic for new image notifications
const newImageTopic = new sns.Topic(edaStack, "NewImageTopic", {
  displayName: "New Image topic",
});

newImageTopic.addSubscription(
  new subs.SqsSubscription(imageProcessQueue)
);

// Lambda function for processing images
const processImageFn = new lambdanode.NodejsFunction(
  edaStack,
  "ProcessImageFn",
  {
    runtime: lambda.Runtime.NODEJS_18_X,
    entry: `${__dirname}/../lambdas/processImage.ts`,
    timeout: cdk.Duration.seconds(15),
    memorySize: 128,
  }
);

// Define S3 bucket with notifications
const imagesBucket = new s3.Bucket(edaStack, "ImagesBucket", {
  removalPolicy: cdk.RemovalPolicy.DESTROY,
});

// S3 --> SNS --> SQS: Trigger SNS topic on image creation in S3
imagesBucket.addEventNotification(
  s3.EventType.OBJECT_CREATED,
  new s3n.SnsDestination(newImageTopic)
);

// SQS --> Lambda: Process new images in batches
const newImageEventSource = new events.SqsEventSource(imageProcessQueue, {
  batchSize: 5,
  maxBatchingWindow: cdk.Duration.seconds(5),
});

processImageFn.addEventSource(newImageEventSource);

// Permissions: Grant Lambda function read access to the S3 bucket
imagesBucket.grantRead(processImageFn);

// Output the bucket name
new cdk.CfnOutput(edaStack, "BucketNameOutput", {
  value: imagesBucket.bucketName,
});
