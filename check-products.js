const mysql = require('mysql');

// 数据库连接配置
const dbConfig = {
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system',
    multipleStatements: true
};

function checkProducts() {
    // 创建数据库连接
    const connection = mysql.createConnection(dbConfig);
    
    console.log('检查产品列表...\n');
    
    // 查询产品列表
    connection.query(`
        SELECT id, product_code, product_name, category 
        FROM products 
        ORDER BY id 
        LIMIT 10
    `, (err, products) => {
        if (err) {
            console.error('查询产品失败:', err);
            connection.end();
            return;
        }
        
        console.log('产品列表:');
        console.log('ID\t产品编码\t产品名称\t\t类别');
        console.log('------------------------------------------------------');
        products.forEach(product => {
            console.log(`${product.id}\t${product.product_code}\t\t${product.product_name}\t\t${product.category || 'N/A'}`);
        });
        
        // 关闭连接
        connection.end();
    });
}

// 运行检查
checkProducts();