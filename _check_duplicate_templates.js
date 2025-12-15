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
    
    // 查询所有产品编码
    db.query('SELECT DISTINCT product_code FROM device_templates ORDER BY product_code', (err, products) => {
        if (err) {
            console.error('查询失败:', err);
            db.end();
            return;
        }
        
        console.log('共有', products.length, '个产品有配置模板\n');
        
        let totalDuplicates = 0;
        let processedCount = 0;
        
        products.forEach(product => {
            const productCode = product.product_code;
            
            // 查询该产品的所有配件配置
            db.query(`
                SELECT id, product_code, accessory_category_id, accessory_name, brand, model, quantity, created_at
                FROM device_templates
                WHERE product_code = ?
                ORDER BY accessory_category_id, brand, model, created_at
            `, [productCode], (err, templates) => {
                if (err) {
                    console.error('查询模板失败:', err);
                    return;
                }
                
                // 检查重复项（同一产品+同一类别+同一品牌+同一型号）
                const uniqueMap = new Map();
                const duplicates = [];
                
                templates.forEach(t => {
                    const key = `${t.accessory_category_id}:${t.brand}:${t.model}`;
                    
                    if (uniqueMap.has(key)) {
                        // 发现重复
                        duplicates.push({
                            id: t.id,
                            key: key,
                            original: uniqueMap.get(key),
                            duplicate: t
                        });
                    } else {
                        uniqueMap.set(key, t);
                    }
                });
                
                if (duplicates.length > 0) {
                    console.log(`\n产品编码: ${productCode}`);
                    console.log(`发现 ${duplicates.length} 个重复配件:\n`);
                    
                    duplicates.forEach(dup => {
                        console.log(`  重复项 ID: ${dup.duplicate.id}`);
                        console.log(`  - 配件名称: ${dup.duplicate.accessory_name}`);
                        console.log(`  - 品牌型号: ${dup.duplicate.brand} ${dup.duplicate.model}`);
                        console.log(`  - 数量: ${dup.duplicate.quantity}`);
                        console.log(`  - 创建时间: ${dup.duplicate.created_at}`);
                        console.log(`  原始记录 ID: ${dup.original.id} (创建时间: ${dup.original.created_at})\n`);
                    });
                    
                    totalDuplicates += duplicates.length;
                }
                
                processedCount++;
                
                // 所有产品都处理完了
                if (processedCount === products.length) {
                    console.log('\n========================================');
                    console.log(`总共发现 ${totalDuplicates} 个重复配件\n`);
                    
                    if (totalDuplicates > 0) {
                        console.log('如需删除重复项，请运行: node _delete_duplicate_templates.js');
                    } else {
                        console.log('没有发现重复配件');
                    }
                    
                    db.end();
                }
            });
        });
        
        if (products.length === 0) {
            console.log('没有找到任何产品配置模板');
            db.end();
        }
    });
});
