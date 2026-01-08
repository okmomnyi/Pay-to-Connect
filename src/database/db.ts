import DatabaseConnection from './connection';

const dbInstance = DatabaseConnection.getInstance();
const pool = dbInstance.getPool();

export default pool;
