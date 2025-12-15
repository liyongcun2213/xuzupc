const mysql = require('mysql');

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system'
});

connection.connect(err => {
    if (err) {
        console.error('连接失败:', err);
        return;
    }
    console.log('已连接到MySQL服务器');
    
    // 查询所有产品类别
    connection.query('SELECT * FROM product_categories ORDER BY name', (err, categories) => {
        if (err) {
            console.error('查询产品类别失败:', err);
            connection.end();
            return;
        }
        
        console.log('产品类别列表:');
        categories.forEach(category => {
            console.log(`ID: ${category.id}, 名称: ${category.name}`);
        });
        
        connection.end();
    });
});