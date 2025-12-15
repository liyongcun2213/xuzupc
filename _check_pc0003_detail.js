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
    
    // 先查询PC0003产品信息
    db.query('SELECT * FROM products WHERE product_code = "PC0003"', (err, products) => {
        if (err) {
            console.error('查询产品失败:', err);
            db.end();
            return;
        }
        
        if (products.length === 0) {
            console.log('未找到PC0003产品');
            db.end();
            return;
        }
        
        const product = products[0];
        console.log('产品信息:');
        console.log('产品编码:', product.product_code);
        console.log('产品名称:', product.name);
        console.log('产品型号:', product.model_number);
        console.log('');
        
        // 查询device_templates中的配置
        console.log('='.repeat(80));
        console.log('【device_templates 表中的配置】（设备组装页面使用）');
        console.log('='.repeat(80));
        
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
                console.error('查询模板失败:', err);
                db.end();
                return;
            }
            
            console.log('\nID\t类别\t\t配件名称\t\t品牌\t型号\t\t数量');
            console.log('-'.repeat(80));
            templates.forEach(t => {
                console.log(`${t.id}\t${t.category_name}\t\t${t.accessory_name}\t${t.brand}\t${t.model}\t${t.quantity}`);
            });
            
            // 查询product_accessories中的配置
            console.log('\n' + '='.repeat(80));
            console.log('【product_accessories 表中的配置】（产品详情页面使用）');
            console.log('='.repeat(80));
            
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
                    console.error('查询配件失败:', err);
                    db.end();
                    return;
                }
                
                console.log('\nID\t类别\t\t配件名称\t品牌\t型号\t\t数量');
                console.log('-'.repeat(80));
                accessories.forEach(a => {
                    console.log(`${a.id}\t${a.category_name}\t${a.accessory_name}\t${a.brand}\t${a.model}\t${a.quantity}`);
                });
                
                // 比较两个表的数据
                console.log('\n' + '='.repeat(80));
                console.log('数据一致性检查:');
                console.log('='.repeat(80));
                
                let isConsistent = true;
                const categoryMap = {};
                
                // 构建 device_templates 的映射
                templates.forEach(t => {
                    categoryMap[t.category_name] = {
                        template: t,
                        accessory: null
                    };
                });
                
                // 填充 product_accessories 数据
                accessories.forEach(a => {
                    if (categoryMap[a.category_name]) {
                        categoryMap[a.category_name].accessory = a;
                    }
                });
                
                // 检查每个类别
                for (const category in categoryMap) {
                    const data = categoryMap[category];
                    if (data.template && data.accessory) {
                        const t = data.template;
                        const a = data.accessory;
                        
                        if (t.brand !== a.brand || t.model !== a.model || t.quantity !== a.quantity) {
                            console.log(`❌ ${category}: 配置不一致`);
                            console.log(`   device_templates: ${t.brand} ${t.model} x${t.quantity}`);
                            console.log(`   product_accessories: ${a.brand} ${a.model} x${a.quantity}`);
                            isConsistent = false;
                        } else {
                            console.log(`✅ ${category}: ${t.brand} ${t.model} x${t.quantity}`);
                        }
                    }
                }
                
                console.log('\n' + '='.repeat(80));
                if (isConsistent) {
                    console.log('✅ 数据一致性检查通过！');
                    console.log('device_templates 表和 product_accessories 表的数据完全一致。');
                } else {
                    console.log('❌ 数据不一致！');
                    console.log('device_templates 表和 product_accessories 表的数据存在差异，需要同步。');
                }
                console.log('='.repeat(80));
                
                db.end();
            });
        });
    });
});
