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

function checkRentalData() {
    // 创建数据库连接
    const connection = mysql.createConnection(dbConfig);
    
    console.log('检查租赁相关数据...\n');
    
    // 检查客户数据
    connection.query('SELECT id, name FROM customers ORDER BY name LIMIT 5', (err, customers) => {
        if (err) {
            console.error('查询客户失败:', err);
            connection.end();
            return;
        }
        
        console.log('客户列表:');
        console.log('ID\t姓名');
        console.log('----------------');
        customers.forEach(customer => {
            console.log(`${customer.id}\t${customer.name}`);
        });
        
        // 检查设备数据
        connection.query(`
            SELECT d.id, d.serial_number, d.status, 
                   p.name as product_name, p.product_code,
                   p.rental_price_per_day, p.rental_price_per_month
            FROM devices d
            JOIN products p ON d.product_id = p.id
            WHERE d.status = "available"
            ORDER BY p.product_code
            LIMIT 5
        `, (err, devices) => {
            if (err) {
                console.error('查询设备失败:', err);
                connection.end();
                return;
            }
            
            console.log('\n可用设备列表:');
            console.log('ID\t序列号\t\t产品编码\t产品名称\t\t日租金\t月租金');
            console.log('-----------------------------------------------------------------------------------');
            devices.forEach(device => {
                console.log(`${device.id}\t${device.serial_number}\t${device.product_code}\t${device.product_name}\t\t${device.rental_price_per_day || 0}\t${device.rental_price_per_month || 0}`);
            });
            
            // 关闭连接
            connection.end();
            
            console.log('\n结论:');
            console.log('1. 如果有客户和可用设备，应该可以创建租赁订单');
            console.log('2. 如果缺少客户或设备，需要先添加相应数据');
            console.log('3. 租赁订单创建页面: http://localhost:3000/rental-orders/add');
        });
    });
}

// 运行检查
checkRentalData();