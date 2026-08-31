const AWS = require('aws-sdk');

const ddbClient = new AWS.DynamoDB();

const marshallOptions:any = {
  convertEmptyValues: false,
  removeUndefinedValues: true,
  convertClassInstanceToMap: true,
};

export const updateItem = async (table: any, key: any, value: any, condition: any) => {

    let updateExpression = "SET ";
    const expressionAttributeNames:any = {}
    const expressionAttributeValues:any = {}

    const valueMarshal = AWS.DynamoDB.Converter.marshall(value, marshallOptions);

    const keys = Object.keys(key);

    Object.keys(value).forEach((entry: any) => {
      if (!keys.includes(entry)) {
        updateExpression = `${updateExpression} #${entry} = :${entry}, `;
      }

      if (!keys.includes(entry) || (condition && keys.includes(entry) && condition.includes('#' + entry))) {
        expressionAttributeNames[`#${entry}`] = entry;
      }

      if (!keys.includes(entry) || (condition && keys.includes(entry) && condition.includes(':' + entry))) {
        expressionAttributeValues[`:${entry}`] = valueMarshal[entry];
      }
    })

    updateExpression = updateExpression.substring(0, updateExpression.lastIndexOf(','));

    const params:any = {
      TableName: table,
      Key: AWS.DynamoDB.Converter.marshall(key),
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues
    };

    if(condition) params.ConditionExpression = condition;

    console.log(params);

    return await ddbClient.updateItem(params).promise();
}
