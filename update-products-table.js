const mysql = require('mysql');

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system'
});

connection.connect(err => {
    if (err) {
        console.error('连接MySQL服务器失败:', err);
        return;
    }
    console.log('已连接到MySQL服务器');
    
    // 检查并更新产品表结构
    connection.query('DESCRIBE products', (err, result) => {
        if (err) {
            console.error('检查产品表结构失败:', err);
            connection.end();
            return;
        }
        
        const columns = result.map(col => col.Field);
        const updates = [];
        
        if (!columns.includes('product_code')) {
            updates.push('ADD COLUMN product_code VARCHAR(20) UNIQUE');
        }
        if (!columns.includes('model_number')) {
            updates.push('ADD COLUMN model_number VARCHAR(255)');
        }
        
        if (updates.length > 0) {
            const alterSql = `ALTER TABLE products ${updates.join(', ')}`;
            connection.query(alterSql, (err) => {
                if (err) {
                    console.error('更新产品表结构失败:', err);
                    connection.end();
                    return;
                }
                console.log('已更新产品表结构');
                connection.end();
            });
        } else {
            console.log('产品表结构已是最新');
            connection.end();
        }
    });
});