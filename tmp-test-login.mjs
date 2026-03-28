import fetch from 'node-fetch';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import config from 'config';

async function testLogin() {
  try {
    const res = await fetch('http://127.0.0.1:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test', password: 'test123' })
    });
    console.log('login status', res.status);
    console.log('login body', await res.text());
  } catch (err) {
    console.error('login error', err);
  }
}

async function listUsers() {
  try {
    const db = await open({ filename: config.get('db.filename'), driver: sqlite3.Database });
    const users = await db.all('SELECT id, username, email FROM Usuarios');
    console.log('users:', users);
    await db.close();
  } catch (err) {
    console.error('db error', err);
  }
}

await listUsers();
await testLogin();
