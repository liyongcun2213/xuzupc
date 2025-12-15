const mysql = require('mysql');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system'
});

db.connect((err) => {
    if (err) {
        console.error('数据库连接失败:', err);
        process.exit(1);
    }
    console.log('✓ 已连接到数据库\n');
    
    // 查询设备和产品信息
    const sql = `
        SELECT d.id, d.serial_number, d.status, d.device_code,
               p.name as product_name, p.product_code, p.specifications,
               p.rental_price_per_day, p.rental_price_per_month
        FROM devices d
        JOIN products p ON d.product_id = p.id
        WHERE d.status IN ('in_warehouse', 'available')
        ORDER BY p.product_code, d.serial_number
        LIMIT 5
    `;
    
    db.query(sql, (err, results) => {
        if (err) {
            console.error('查询失败:', err);
            db.end();
            return;
        }
        
        console.log(`找到 ${results.length} 个可用设备:\n`);
        console.log('设备编号\t\t产品型号\t规格配置\t\t\t月租金\t日租金');
        console.log('='.repeat(100));
        
        results.forEach(device => {
            const code = device.device_code || device.serial_number || '-';
            const productCode = device.product_code || '-';
            const spec = device.specifications || '-';
            const monthly = device.rental_price_per_month || 0;
            const daily = device.rental_price_per_day || 0;
            
            console.log(`${code}\t${productCode}\t${spec}\t${monthly}\t${daily}`);
        });
        
        console.log('\n详细数据:');
        console.log(JSON.stringify(results, null, 2));
        
        db.end();
    });
});
