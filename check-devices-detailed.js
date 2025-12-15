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

function checkDevicesDetailed() {
    // 创建数据库连接
    const connection = mysql.createConnection(dbConfig);
    
    console.log('检查设备和产品详细信息...\n');
    
    // 检查产品数据
    connection.query('SELECT id, name, product_code, rental_price_per_day, rental_price_per_month FROM products ORDER BY product_code LIMIT 10', (err, products) => {
        if (err) {
            console.error('查询产品失败:', err);
            connection.end();
            return;
        }
        
        console.log('产品列表:');
        console.log('ID\t产品编码\t产品名称\t\t\t日租金\t月租金');
        console.log('-----------------------------------------------------------------------------------');
        products.forEach(product => {
            console.log(`${product.id}\t${product.product_code || 'N/A'}\t${product.name}\t\t${product.rental_price_per_day || 0}\t${product.rental_price_per_month || 0}`);
        });
        
        // 检查设备数据
        connection.query(`
            SELECT d.id, d.serial_number, d.status, d.product_id,
                   p.name as product_name, p.product_code,
                   p.rental_price_per_day, p.rental_price_per_month
            FROM devices d
            JOIN products p ON d.product_id = p.id
            ORDER BY d.status, p.product_code
            LIMIT 10
        `, (err, devices) => {
            if (err) {
                console.error('查询设备失败:', err);
                connection.end();
                return;
            }
            
            console.log('\n设备列表:');
            console.log('ID\t序列号\t\t状态\t\t产品编码\t产品名称');
            console.log('-----------------------------------------------------------------------------------');
            devices.forEach(device => {
                console.log(`${device.id}\t${device.serial_number}\t\t${device.status}\t\t${device.product_code || 'N/A'}\t${device.product_name}`);
            });
            
            // 关闭连接
            connection.end();
            
            console.log('\n结论:');
            console.log('1. 如果没有可用设备，但存在产品，需要为产品创建设备实例');
            console.log('2. 如果产品没有设置租金，需要先设置租金价格');
            console.log('3. 设备状态必须是"available"才能用于租赁');
        });
    });
}

// 运行检查
checkDevicesDetailed();