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