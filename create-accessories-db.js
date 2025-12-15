const mysql = require('mysql');
const fs = require('fs');

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system',
    charset: 'utf8mb4'
});

connection.connect();

// 读取SQL文件内容
const sql = fs.readFileSync('accessories-db.sql', 'utf8');

// 按分号分割SQL语句
const statements = sql.split(';').filter(stmt => stmt.trim() !== '');

console.log('开始执行配件管理数据库初始化脚本...');

// 执行每个语句
function executeStatements(index) {
    if (index >= statements.length) {
        console.log('配件管理数据库初始化完成');
        connection.end();
        return;
    }
    
    const statement = statements[index].trim();
    if (!statement) {
        executeStatements(index + 1);
        return;
    }
    
    console.log('执行语句:', statement.substring(0, 50) + '...');
    
    connection.query(statement, (err, result) => {
        if (err) {
            // 某些语句可能会因为已存在而失败，这是正常的
            if (!err.message.includes('Duplicate column name') && 
                !err.message.includes('already exists') &&
                !err.message.includes('Duplicate entry')) {
                console.error('执行错误:', err.message);
            }
        } else {
            console.log('执行成功');
        }
        
        // 继续执行下一个语句
        executeStatements(index + 1);
    });
}

executeStatements(0);