import { getDb, accountsDb } from './db';

getDb();
accountsDb.add('测试账号', 'https://www.douyin.com/user/test');
console.log(accountsDb.list());
