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
    console.log('开始同步PC0002配置数据...\n');
    console.log('根据产品型号 i7-8700k/32G/512G/1060 5G/24寸高清');
    console.log('将 device_templates 表同步为与 product_accessories 表一致\n');
    
    // 1. 更新CPU：i9-11900KF -> i7-8700k
    console.log('1. 更新CPU配置...');
    db.query(`
        UPDATE device_templates 
        SET accessory_name = 'intel Core i7-8700k', 
            model = 'i7-8700k'
        WHERE product_code = 'PC0002' 
        AND accessory_category_id = (SELECT id FROM accessory_categories WHERE name = 'CPU')
    `, (err, result) => {
        if (err) {
            console.error('更新CPU失败:', err);
            db.end();
            return;
        }
        console.log('   CPU: intel i9-11900KF -> intel i7-8700k ✓');
        
        // 2. 更新主板：B560 -> B360
        console.log('\n2. 更新主板配置...');
        db.query(`
            UPDATE device_templates 
            SET accessory_name = '微星迫击炮B360', 
                model = 'B360'
            WHERE product_code = 'PC0002' 
            AND accessory_category_id = (SELECT id FROM accessory_categories WHERE name = '主板')
        `, (err, result) => {
            if (err) {
                console.error('更新主板失败:', err);
                db.end();
                return;
            }
            console.log('   主板: 微星 B560 -> 微星 B360 ✓');
            
            // 3. 更新硬盘：1T -> 512G
            console.log('\n3. 更新硬盘配置...');
            db.query(`
                UPDATE device_templates 
                SET accessory_name = '威刚NV 512G', 
                    model = '512G'
                WHERE product_code = 'PC0002' 
                AND accessory_category_id = (SELECT id FROM accessory_categories WHERE name = '硬盘')
            `, (err, result) => {
                if (err) {
                    console.error('更新硬盘失败:', err);
                    db.end();
                    return;
                }
                console.log('   硬盘: 威刚 1T -> 威刚 512G ✓');
                
                // 4. 更新电源：525瓦 -> 425瓦
                console.log('\n4. 更新电源配置...');
                db.query(`
                    UPDATE device_templates 
                    SET accessory_name = '长城网星530', 
                        model = '425瓦'
                    WHERE product_code = 'PC0002' 
                    AND accessory_category_id = (SELECT id FROM accessory_categories WHERE name = '电源')
                `, (err, result) => {
                    if (err) {
                        console.error('更新电源失败:', err);
                        db.end();
                        return;
                    }
                    console.log('   电源: 长城 525瓦 -> 长城 425瓦 ✓');
                    
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
                        WHERE dt.product_code = 'PC0002'
                        ORDER BY dt.accessory_category_id
                    `, (err, templates) => {
                        if (err) {
                            console.error('查询失败:', err);
                            db.end();
                            return;
                        }
                        
                        console.log('\n【device_templates 表】');
                        console.log('ID\t类别\t\t配件名称\t\t品牌\t型号\t\t数量');
                        console.log('-'.repeat(80));
                        templates.forEach(t => {
                            console.log(`${t.id}\t${t.category_name}\t\t${t.accessory_name}\t${t.brand}\t${t.model}\t${t.quantity}`);
                        });
                        
                        // 查询 product_accessories 进行对比
                        db.query(`
                            SELECT 
                                pa.id,
                                ac.name AS category_name,
                                a.name AS accessory_name,
                                a.brand,
                                a.model,
                                pa.quantity
                            FROM product_accessories pa
                            LEFT JOIN accessories a ON pa.accessory_id = a.id
                            LEFT JOIN accessory_categories ac ON a.category_id = ac.id
                            WHERE pa.product_id = (SELECT id FROM products WHERE product_code = 'PC0002')
                            ORDER BY a.category_id
                        `, (err, accessories) => {
                            if (err) {
                                console.error('查询配件失败:', err);
                                db.end();
                                return;
                            }
                            
                            console.log('\n【product_accessories 表】');
                            console.log('ID\t类别\t\t配件名称\t品牌\t型号\t\t数量');
                            console.log('-'.repeat(80));
                            accessories.forEach(a => {
                                console.log(`${a.id}\t${a.category_name}\t${a.accessory_name}\t${a.brand}\t${a.model}\t${a.quantity}`);
                            });
                            
                            console.log('\n✅ PC0002配置同步完成！');
                            console.log('device_templates 表已与 product_accessories 表保持一致。');
                            
                            db.end();
                        });
                    });
                });
            });
        });
    });
});
