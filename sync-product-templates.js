const mysql = require('mysql');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system'
});

db.connect();

console.log('开始同步产品配件到device_templates表...\n');

// 查询所有有配件的产品
db.query(`
    SELECT DISTINCT 
        p.id as product_id,
        p.product_code as product_code,
        p.name as product_name
    FROM products p
    JOIN product_accessories pa ON p.id = pa.product_id
    WHERE p.product_code IS NOT NULL 
      AND p.product_code != ''
`, (err, products) => {
    if (err) {
        console.error('查询产品失败:', err);
        db.end();
        return;
    }
    
    if (products.length === 0) {
        console.log('没有需要同步的产品');
        db.end();
        return;
    }
    
    console.log(`找到 ${products.length} 个产品需要同步:`);
    console.table(products);
    
    let completed = 0;
    
    products.forEach(product => {
        // 查询该产品的所有配件
        db.query(`
            SELECT 
                pa.accessory_id,
                a.name as accessory_name,
                a.brand,
                a.model,
                a.category_id,
                ac.name as category_name
            FROM product_accessories pa
            JOIN accessories a ON pa.accessory_id = a.id
            JOIN accessory_categories ac ON a.category_id = ac.id
            WHERE pa.product_id = ?
            ORDER BY ac.id
        `, [product.product_id], (err2, accessories) => {
            if (err2) {
                console.error(`查询产品 ${product.product_code} 的配件失败:`, err2);
                completed++;
                if (completed === products.length) db.end();
                return;
            }
            
            console.log(`\n产品 ${product.product_code} - ${product.product_name} 有 ${accessories.length} 个配件`);
            
            // 先删除该产品的旧模板
            db.query('DELETE FROM device_templates WHERE product_code = ?', [product.product_code], (err3) => {
                if (err3) {
                    console.error(`删除旧模板失败:`, err3);
                    completed++;
                    if (completed === products.length) db.end();
                    return;
                }
                
                if (accessories.length === 0) {
                    console.log(`产品 ${product.product_code} 没有配件，跳过`);
                    completed++;
                    if (completed === products.length) db.end();
                    return;
                }
                
                // 插入新模板
                let insertCount = 0;
                accessories.forEach(accessory => {
                    db.query(`
                        INSERT INTO device_templates (
                            product_code,
                            product_name,
                            accessory_category_id,
                            accessory_name,
                            brand,
                            model,
                            quantity,
                            created_at,
                            updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, 1, NOW(), NOW())
                    `, [
                        product.product_code,
                        product.product_name,
                        accessory.category_id,
                        accessory.category_name,
                        accessory.brand,
                        accessory.model
                    ], (err4) => {
                        if (err4) {
                            console.error(`  - 插入配件 ${accessory.accessory_name} 失败:`, err4.message);
                        } else {
                            console.log(`  ✓ 插入配件: ${accessory.category_name} - ${accessory.brand} ${accessory.model}`);
                        }
                        
                        insertCount++;
                        if (insertCount === accessories.length) {
                            console.log(`产品 ${product.product_code} 同步完成！`);
                            completed++;
                            if (completed === products.length) {
                                console.log('\n所有产品同步完成！');
                                db.end();
                            }
                        }
                    });
                });
            });
        });
    });
});
