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
    console.log('='.repeat(80));
    console.log('检查所有产品的配件配置是否有重复');
    console.log('='.repeat(80));
    
    // 查询所有产品编码
    db.query('SELECT DISTINCT product_code FROM device_templates ORDER BY product_code', (err, products) => {
        if (err) {
            console.error('查询失败:', err);
            db.end();
            return;
        }
        
        console.log(`\n共有 ${products.length} 个产品有配置模板\n`);
        
        let processedCount = 0;
        let totalDuplicates = 0;
        const productsWithDuplicates = [];
        
        if (products.length === 0) {
            console.log('没有找到任何产品配置模板');
            db.end();
            return;
        }
        
        products.forEach(product => {
            const productCode = product.product_code;
            
            // 查询该产品的所有配件配置
            db.query(`
                SELECT 
                    dt.id,
                    dt.product_code,
                    dt.accessory_category_id,
                    ac.name AS category_name,
                    dt.accessory_name,
                    dt.brand,
                    dt.model,
                    dt.quantity,
                    dt.created_at
                FROM device_templates dt
                LEFT JOIN accessory_categories ac ON dt.accessory_category_id = ac.id
                WHERE dt.product_code = ?
                ORDER BY dt.accessory_category_id, dt.created_at
            `, [productCode], (err, templates) => {
                if (err) {
                    console.error('查询模板失败:', err);
                    return;
                }
                
                // 按类别统计
                const categoryMap = new Map();
                
                templates.forEach(t => {
                    const catId = t.accessory_category_id;
                    const catName = t.category_name || '未分类';
                    const key = `${catId}:${catName}`;
                    
                    if (!categoryMap.has(key)) {
                        categoryMap.set(key, []);
                    }
                    categoryMap.get(key).push(t);
                });
                
                // 检查是否有重复
                const duplicates = [];
                categoryMap.forEach((items, key) => {
                    if (items.length > 1) {
                        duplicates.push({
                            key: key,
                            items: items
                        });
                    }
                });
                
                if (duplicates.length > 0) {
                    console.log(`\n${'='.repeat(80)}`);
                    console.log(`⚠️  产品编码: ${productCode}`);
                    console.log(`${'='.repeat(80)}`);
                    console.log(`发现 ${duplicates.length} 个配件类别有重复:\n`);
                    
                    duplicates.forEach(dup => {
                        const parts = dup.key.split(':');
                        const categoryName = parts[1];
                        
                        console.log(`  【${categoryName}】- 共 ${dup.items.length} 条记录:`);
                        dup.items.forEach((item, index) => {
                            console.log(`    ${index + 1}. ID:${item.id} - ${item.accessory_name} (${item.brand} ${item.model}) x${item.quantity} [${item.created_at}]`);
                        });
                        console.log('');
                    });
                    
                    productsWithDuplicates.push({
                        productCode: productCode,
                        duplicateCount: duplicates.length
                    });
                    totalDuplicates += duplicates.length;
                }
                
                processedCount++;
                
                // 所有产品都处理完了
                if (processedCount === products.length) {
                    console.log(`\n${'='.repeat(80)}`);
                    console.log('检查结果汇总');
                    console.log(`${'='.repeat(80)}`);
                    
                    if (productsWithDuplicates.length > 0) {
                        console.log(`\n有 ${productsWithDuplicates.length} 个产品存在重复配件:\n`);
                        productsWithDuplicates.forEach(p => {
                            console.log(`  - ${p.productCode}: ${p.duplicateCount} 个配件类别重复`);
                        });
                        console.log(`\n总共发现 ${totalDuplicates} 个配件类别重复\n`);
                    } else {
                        console.log('\n✓ 所有产品配置都没有重复配件\n');
                    }
                    
                    db.end();
                }
            });
        });
    });
});
