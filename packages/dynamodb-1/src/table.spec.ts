import assert from 'assert';
import DynamoDB from 'aws-sdk/clients/dynamodb';
import { Entity, Table } from 'dynamodb-toolbox';
import { UserEntity } from './entities';
import deepCopy from 'deep-copy';

import {
  getTableName,
  connect,
  stopLocalDynamoDB,
  connectTable,
} from './table';

// needs to be long to download Docker image etc.
jest.setTimeout(120000);

describe('DynamoDB Table', () => {
  it('Should connect to local table', async () => {
    const tableName = await getTableName();
    assert(tableName);
    const dynamoDB = await connect();
    assert(dynamoDB);
    const tableInfo = await dynamoDB
      .describeTable({ TableName: tableName })
      .promise();

    assert(tableInfo.Table?.TableStatus === 'ACTIVE');
    const dynamoDB2 = await connect();
    assert(dynamoDB2);
  });

  it('Should be able to instantiate Toolbox table', async () => {
    const dynamoDB = await connect();
    const table1 = await connectTable({ client: dynamoDB });
    assert(table1);
    const table2 = await connectTable({
      documentClient: new DynamoDB.DocumentClient({ service: dynamoDB }),
    });
    assert(table2);
    const table3 = await connectTable();
    assert(table3);
  });

  it('Should be able to write and read an entity with native toolbox methods', async () => {
    const table = new Table({
      name: await getTableName(),
      partitionKey: 'pk',
      sortKey: 'sk',
      DocumentClient: new DynamoDB.DocumentClient({ service: await connect() }),
    });

    const e = new Entity({
      name: 'User',
      attributes: {
        pk: { partitionKey: true },
        sk: { hidden: true, sortKey: true },
        name: { type: 'string', required: true },
        emailVerified: { type: 'boolean', required: true },
      },
      table,
    } as const);

    await e.put({
      pk: 'joe@email.com',
      sk: 'admin',
      name: 'Joe',
      emailVerified: true,
    });

    const { Item: user } = await e.get(
      { pk: 'joe@email.com', sk: 'admin' },
      { attributes: ['name', 'pk'] }
    );

    expect(user.name).toEqual('Joe');
  });

  it('Should be able to write and read an entity with entities', async () => {
    const table = await connectTable();
    // important to do deep copy here because of
    //   https://github.com/jeremydaly/dynamodb-toolbox/issues/310
    const Users = new Entity({ ...deepCopy(UserEntity), table } as const);
    await Users.put({
      email: 'joe@email.com',
      name: 'Joe',
      emailVerified: true,
    });
    const { Item: user } = await Users.get(
      { email: 'joe@email.com' },
      { attributes: ['name', 'email'] }
    );
    expect(user.name).toEqual('Joe');
    expect(user.email).toEqual('joe@email.com');
  });

  afterAll(async () => {
    await stopLocalDynamoDB();
  });
});
