const AWS = require('aws-sdk');

const ddbClient = new AWS.DynamoDB();

export const updateItem = async (table: any, key: any, value: any, condition: any) => {


  const params:any = {
    TableName: table,
    Key: AWS.DynamoDB.Converter.marshall(key),
    Value: value
  };

  return await ddbClient.updateItem(params).promise();
}
