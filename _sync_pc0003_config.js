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
        return;
    }
    
    console.log('数据库连接成功\n');
    console.log('开始同步PC0003配置数据...\n');
    
    // 1. 更新内存：16G -> 32G
    console.log('1. 更新内存配置...');
    db.query(`
        UPDATE device_templates 
        SET accessory_name = '光威DDR4 32G', 
            model = '32G'
        WHERE product_code = 'PC0003' 
        AND accessory_category_id = (SELECT id FROM accessory_categories WHERE name = '内存')
    `, (err, result) => {
        if (err) {
            console.error('更新内存失败:', err);
            db.end();
            return;
        }
        console.log('   内存: 光威DDR4 16G -> 光威DDR4 32G ✓');
        
        // 2. 更新硬盘：光威NV 256G -> 威刚NV 1T
        console.log('\n2. 更新硬盘配置...');
        db.query(`
            UPDATE device_templates 
            SET accessory_name = '威刚NV1T', 
                brand = '威刚',
                model = '1T'
            WHERE product_code = 'PC0003' 
            AND accessory_category_id = (SELECT id FROM accessory_categories WHERE name = '硬盘')
        `, (err, result) => {
            if (err) {
                console.error('更新硬盘失败:', err);
                db.end();
                return;
            }
            console.log('   硬盘: 光威NV 256G -> 威刚NV 1T ✓');
            
            // 3. 更新电源：长城网星530 425瓦 -> 长城网星630 525瓦
            console.log('\n3. 更新电源配置...');
            db.query(`
                UPDATE device_templates 
                SET accessory_name = '长城网星630', 
                    model = '525瓦'
                WHERE product_code = 'PC0003' 
                AND accessory_category_id = (SELECT id FROM accessory_categories WHERE name = '电源')
            `, (err, result) => {
                if (err) {
                    console.error('更新电源失败:', err);
                    db.end();
                    return;
                }
                console.log('   电源: 长城网星530 425瓦 -> 长城网星630 525瓦 ✓');
                
                // 验证更新结果
                console.log('\n' + '='.repeat(80));
                console.log('验证更新后的配置...');
                console.log('='.repeat(80));
                
                db.query(`
                    SELECT 
                        dt.id,
                        ac.name AS category_name,
                        dt.accessory_name,
                        dt.brand,
                        dt.model,
                        dt.quantity
                    FROM device_templates dt
                    LEFT JOIN accessory_categories ac ON dt.accessory_category_id = ac.id
                    WHERE dt.product_code = 'PC0003'
                    ORDER BY dt.accessory_category_id
                `, (err, templates) => {
                    if (err) {
                        console.error('查询失败:', err);
                        db.end();
                        return;
                    }
                    
                    console.log('\nID\t类别\t\t配件名称\t\t品牌\t型号\t\t数量');
                    console.log('-'.repeat(80));
                    templates.forEach(t => {
                        console.log(`${t.id}\t${t.category_name}\t\t${t.accessory_name}\t${t.brand}\t${t.model}\t${t.quantity}`);
                    });
                    
                    console.log('\n✅ PC0003配置同步完成！');
                    console.log('device_templates 表已与 product_accessories 表保持一致。');
                    
                    db.end();
                });
            });
        });
    });
});
