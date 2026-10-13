import { MongoClient } from 'mongodb';
import 'dotenv/config';

const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const databaseName = process.env.MONGODB_DB || 'ranniti5';
let client;
let database;
let connecting;

export const connectDatabase = async () => {
  if (database) return database;
  if (!connecting) {
    connecting = MongoClient.connect(mongoUri).then((connectedClient) => {
      client = connectedClient;
      database = client.db(databaseName);
      return database;
    });
  }
  return connecting;
};

export const collection = async (name) => (await connectDatabase()).collection(name);

export const initializeDatabase = async () => {
  const db = await connectDatabase();
  await Promise.all([
    db.collection('users').createIndex({ email: 1 }, { unique: true }),
    db.collection('registrations').createIndex({ id: 1 }, { unique: true }),
    db.collection('payments').createIndex({ registration_id: 1 }, { unique: true }),
    db.collection('invoices').createIndex({ registration_id: 1 }, { unique: true }),
    db.collection('invoices').createIndex({ invoice_number: 1 }, { unique: true }),
    db.collection('entry_passes').createIndex({ registration_id: 1 }, { unique: true }),
    db.collection('entry_passes').createIndex({ pass_number: 1 }, { unique: true }),
    db.collection('entry_passes').createIndex({ qr_token: 1 }, { unique: true }),
    db.collection('checkins').createIndex({ registration_id: 1 }, { unique: true }),
    db.collection('settings').createIndex({ key: 1 }, { unique: true }),
  ]);
  await db.collection('sequences').updateOne({ name: 'invoice' }, { $setOnInsert: { value: 0 } }, { upsert: true });
  await db.collection('sequences').updateOne({ name: 'entry_pass' }, { $setOnInsert: { value: 0 } }, { upsert: true });
  await db.collection('settings').updateOne({ key: 'seller' }, { $setOnInsert: {
    key: 'seller',
    name: 'Imperial Innoventures',
    gstin: '24ADSPV9796P1ZW',
    pan: 'ADSPV9796P',
    address: 'Gandhidham, Kutch, Gujarat',
    state_name: 'Gujarat',
    state_code: '24',
    upi_id: 'munjalshah9@okicici',
    bank_name: 'Kotak Mahindra Bank',
    account_number: '0114137470',
    ifsc: 'KKBK0000822',
    branch: 'Gandhidham Branch',
    email: 'hello@bnikutch.com',
    phone: '+91 98795 01364'
  } }, { upsert: true });
  console.log(`Connected to MongoDB database ${databaseName}`);
};

export const nextSequence = async (name) => {
  const result = await (await collection('sequences')).findOneAndUpdate(
    { name }, { $inc: { value: 1 } }, { upsert: true, returnDocument: 'after' },
  );
  return result.value;
};

export const closeDatabase = async () => client?.close();
