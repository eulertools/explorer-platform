const AWS = require('aws-sdk');

const ddbClient = new AWS.DynamoDB();

const marshallOptions:any = {
  convertEmptyValues: true,
  removeUndefinedValues: true,
  convertClassInstanceToMap: true,
};

export const getItems = async (search:any) => {

  const response:any = await ddbClient.query(search).promise();

  if(response.Count > 0) {

      return response.Items.map((item:any) => AWS.DynamoDB.Converter.unmarshall(item, marshallOptions));
  }

  return [];
}

export const getItem = async (search:any) => {

    const response:any = await getItems(search);

    if(response.length > 0) return response[0];

    return undefined;
}

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

  return await ddbClient.updateItem(params).promise();
}

export const batchGetItem = async (table: any, keys:any) => {

  const params:any = {
    RequestItems: {
      [table]: {
        Keys: []
      }
    }
  };

  keys.forEach((key:any) => {
    params.RequestItems[table].Keys.push(AWS.DynamoDB.Converter.marshall(key, marshallOptions))
  });

  return ddbClient.batchGetItem(params).promise()
}