const mysql = require('mysql2');
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system'
});

console.log('连接到MySQL数据库...');

// 查询asset_snapshots表结构
db.query('DESCRIBE asset_snapshots', (err, results) => {
    if (err) {
        console.error('查询表结构失败:', err);
        process.exit(1);
    }
    
    console.log('asset_snapshots表结构:');
    results.forEach(column => {
        console.log(`${column.Field}: ${column.Type} ${column.Null ? 'NULL' : 'NOT NULL'} ${column.Default ? `DEFAULT ${column.Default}` : ''}`);
    });
    
    // 查询最新的几条数据
    db.query('SELECT * FROM asset_snapshots ORDER BY snapshot_date DESC LIMIT 3', (err, dataResults) => {
        if (err) {
            console.error('查询数据失败:', err);
            process.exit(1);
        }
        
        console.log('\n最新的3条数据:');
        dataResults.forEach(row => {
            console.log(JSON.stringify(row, null, 2));
        });
        
        process.exit(0);
    });
});