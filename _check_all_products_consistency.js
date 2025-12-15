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
    console.log('检查所有产品的配置数据一致性...\n');
    console.log('='.repeat(100));
    
    // 查询所有产品
    db.query('SELECT * FROM products ORDER BY product_code', (err, products) => {
        if (err) {
            console.error('查询产品失败:', err);
            db.end();
            return;
        }
        
        if (products.length === 0) {
            console.log('未找到任何产品');
            db.end();
            return;
        }
        
        console.log(`共找到 ${products.length} 个产品\n`);
        
        let checkedCount = 0;
        const inconsistentProducts = [];
        
        // 遍历每个产品
        products.forEach((product, index) => {
            // 查询 device_templates
            db.query(`
                SELECT 
                    dt.id,
                    dt.accessory_category_id,
                    ac.name AS category_name,
                    dt.accessory_name,
                    dt.brand,
                    dt.model,
                    dt.quantity
                FROM device_templates dt
                LEFT JOIN accessory_categories ac ON dt.accessory_category_id = ac.id
                WHERE dt.product_code = ?
                ORDER BY dt.accessory_category_id
            `, [product.product_code], (err, templates) => {
                if (err) {
                    console.error(`查询 ${product.product_code} 的模板失败:`, err);
                    return;
                }
                
                // 查询 product_accessories
                db.query(`
                    SELECT 
                        pa.id,
                        pa.accessory_id,
                        ac.name AS category_name,
                        a.name AS accessory_name,
                        a.brand,
                        a.model,
                        pa.quantity
                    FROM product_accessories pa
                    LEFT JOIN accessories a ON pa.accessory_id = a.id
                    LEFT JOIN accessory_categories ac ON a.category_id = ac.id
                    WHERE pa.product_id = ?
                    ORDER BY a.category_id
                `, [product.id], (err, accessories) => {
                    if (err) {
                        console.error(`查询 ${product.product_code} 的配件失败:`, err);
                        return;
                    }
                    
                    checkedCount++;
                    
                    // 比较数据
                    let isConsistent = true;
                    const differences = [];
                    
                    // 如果有 device_templates 但没有 product_accessories
                    if (templates.length > 0 && accessories.length === 0) {
                        isConsistent = false;
                        differences.push('product_accessories 表中无配置数据');
                    }
                    // 如果有 product_accessories 但没有 device_templates
                    else if (templates.length === 0 && accessories.length > 0) {
                        isConsistent = false;
                        differences.push('device_templates 表中无配置数据');
                    }
                    // 两个表都有数据，比较详细内容
                    else if (templates.length > 0 && accessories.length > 0) {
                        const categoryMap = {};
                        
                        // 构建映射
                        templates.forEach(t => {
                            categoryMap[t.category_name] = {
                                template: t,
                                accessory: null
                            };
                        });
                        
                        accessories.forEach(a => {
                            if (categoryMap[a.category_name]) {
                                categoryMap[a.category_name].accessory = a;
                            } else {
                                categoryMap[a.category_name] = {
                                    template: null,
                                    accessory: a
                                };
                            }
                        });
                        
                        // 检查每个类别
                        for (const category in categoryMap) {
                            const data = categoryMap[category];
                            
                            if (!data.template && data.accessory) {
                                isConsistent = false;
                                differences.push(`${category}: device_templates 中缺失`);
                            } else if (data.template && !data.accessory) {
                                isConsistent = false;
                                differences.push(`${category}: product_accessories 中缺失`);
                            } else if (data.template && data.accessory) {
                                const t = data.template;
                                const a = data.accessory;
                                
                                if (t.brand !== a.brand || t.model !== a.model || t.quantity !== a.quantity) {
                                    isConsistent = false;
                                    differences.push(
                                        `${category}: 配置不一致\n` +
                                        `      device_templates: ${t.brand} ${t.model} x${t.quantity}\n` +
                                        `      product_accessories: ${a.brand} ${a.model} x${a.quantity}`
                                    );
                                }
                            }
                        }
                    }
                    
                    // 输出结果
                    const status = isConsistent ? '✅' : '❌';
                    const result = isConsistent ? '一致' : '不一致';
                    console.log(`${status} ${product.product_code} - ${product.name} (${product.model_number || '无型号'})`);
                    console.log(`   device_templates: ${templates.length} 项配置`);
                    console.log(`   product_accessories: ${accessories.length} 项配置`);
                    console.log(`   状态: ${result}`);
                    
                    if (!isConsistent) {
                        inconsistentProducts.push({
                            code: product.product_code,
                            name: product.name,
                            differences: differences
                        });
                        console.log('   差异:');
                        differences.forEach(diff => {
                            console.log(`   - ${diff}`);
                        });
                    }
                    console.log('');
                    
                    // 如果是最后一个产品，输出总结
                    if (checkedCount === products.length) {
                        console.log('='.repeat(100));
                        console.log('检查完成！\n');
                        console.log(`总计: ${products.length} 个产品`);
                        console.log(`一致: ${products.length - inconsistentProducts.length} 个`);
                        console.log(`不一致: ${inconsistentProducts.length} 个`);
                        
                        if (inconsistentProducts.length > 0) {
                            console.log('\n不一致的产品列表:');
                            inconsistentProducts.forEach(p => {
                                console.log(`  - ${p.code}: ${p.name}`);
                            });
                        }
                        
                        console.log('='.repeat(100));
                        db.end();
                    }
                });
            });
        });
    });
});
