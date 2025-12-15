const mysql = require('mysql');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system'
});

db.connect();

console.log('检查PC0008的组装记录...\n');

// 1. 查询PC0008的基本信息
db.query('SELECT * FROM devices WHERE device_code = "PC0008"', (err, devices) => {
    if (err) {
        console.error(err);
        db.end();
        return;
    }
    
    console.log('1. PC0008基本信息:');
    console.table(devices);
    
    if (devices.length === 0) {
        console.log('设备不存在');
        db.end();
        return;
    }
    
    const device = devices[0];
    const productCode = device.product_code;
    
    // 2. 查询device_templates中该产品的配件模板
    db.query('SELECT * FROM device_templates WHERE product_code = ?', [productCode], (err2, templates) => {
        if (err2) {
            console.error(err2);
            db.end();
            return;
        }
        
        console.log(`\n2. device_templates中${productCode}的配件模板 (${templates.length}个):`);
        console.table(templates);
        
        // 3. 查询PC0008实际使用的配件
        db.query(`
            SELECT da.*, a.category_id
            FROM device_assemblies da
            JOIN accessories a ON da.accessory_id = a.id
            WHERE da.device_id = ?
            ORDER BY a.category_id
        `, [device.id], (err3, assemblies) => {
            if (err3) {
                console.error(err3);
                db.end();
                return;
            }
            
            console.log(`\n3. PC0008实际使用的配件 (${assemblies.length}个):`);
            console.table(assemblies);
            
            // 4. 对比应该使用的配件和实际使用的配件
            console.log('\n4. 配件对比:');
            console.log('─'.repeat(80));
            
            templates.forEach(template => {
                const actual = assemblies.find(a => a.category_id === template.accessory_category_id);
                
                const expected = `${template.brand} ${template.model}`;
                const actualUsed = actual ? `${actual.brand} ${actual.model}` : '未找到';
                const match = (template.brand === actual?.brand && template.model === actual?.model) ? '✓' : '✗';
                
                console.log(`${template.accessory_name}:`);
                console.log(`  应该: ${expected}`);
                console.log(`  实际: ${actualUsed} ${match}`);
                console.log('');
            });
            
            db.end();
        });
    });
});
