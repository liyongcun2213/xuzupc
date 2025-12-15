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
    
    console.log('查询设备 PC0003-001...\n');
    
    db.query("SELECT * FROM devices WHERE device_code = 'PC0003-001'", (err, devices) => {
        if (err) {
            console.error(err);
            db.end();
            process.exit(1);
        }
        
        if (devices.length === 0) {
            console.log('设备不存在');
            db.end();
            return;
        }
        
        const device = devices[0];
        console.log('=== 设备信息 ===');
        console.log('设备ID:', device.id);
        console.log('设备编号:', device.device_code);
        console.log('产品ID:', device.product_id);
        console.log('产品编码:', device.product_code);
        console.log('\n查询配件信息...\n');
        
        // 查询实际装配记录
        db.query(`
            SELECT 
                da.*, 
                a.category_id, 
                a.unit_price,
                a.purchase_price,
                ac.name as category_name
            FROM device_assemblies da
            LEFT JOIN accessories a ON da.accessory_id = a.id
            LEFT JOIN accessory_categories ac ON a.category_id = ac.id
            WHERE da.device_id = ?
            ORDER BY ac.name
        `, [device.id], (err, accessories) => {
            if (err) {
                console.error(err);
                db.end();
                process.exit(1);
            }
            
            if (accessories.length === 0) {
                console.log('⚠️ 该设备没有实际装配记录');
                console.log('查询产品模板配置...\n');
                
                // 回退到产品模板
                db.query(`
                    SELECT 
                        a.name AS accessory_name,
                        a.brand,
                        a.model,
                        a.unit_price,
                        a.purchase_price,
                        ac.name AS category_name,
                        pa.quantity
                    FROM product_accessories pa
                    JOIN accessories a ON pa.accessory_id = a.id
                    JOIN accessory_categories ac ON a.category_id = ac.id
                    WHERE pa.product_id = ?
                    ORDER BY ac.name
                `, [device.product_id], (err, templateAccessories) => {
                    if (err) {
                        console.error(err);
                        db.end();
                        process.exit(1);
                    }
                    
                    console.log('=== 产品模板配件（共' + templateAccessories.length + '个）===\n');
                    
                    let originalPrice = 0;
                    let currentPrice = 0;
                    
                    templateAccessories.forEach((acc, idx) => {
                        const qty = acc.quantity || 1;
                        const pPrice = parseFloat(acc.purchase_price) || 0;
                        const uPrice = parseFloat(acc.unit_price) || 0;
                        
                        console.log(`配件${idx + 1}: ${acc.category_name} - ${acc.accessory_name}`);
                        console.log(`  品牌型号: ${acc.brand || '-'} ${acc.model || '-'}`);
                        console.log(`  数量: ${qty}`);
                        console.log(`  采购价: ${pPrice}`);
                        console.log(`  当前单价: ${uPrice}`);
                        console.log(`  采购小计: ${pPrice} × ${qty} = ${(pPrice * qty).toFixed(2)}`);
                        console.log(`  当前小计: ${uPrice} × ${qty} = ${(uPrice * qty).toFixed(2)}`);
                        console.log('');
                        
                        originalPrice += pPrice * qty;
                        currentPrice += uPrice * qty;
                    });
                    
                    console.log('=== 财务计算公式 ===');
                    console.log('原始采购价格 = Σ(配件采购价 × 数量) = ' + originalPrice.toFixed(2));
                    console.log('折旧后价格 = Σ(配件当前单价 × 数量) = ' + currentPrice.toFixed(2));
                    console.log('贬值金额 = 原始采购价格 - 折旧后价格 = ' + originalPrice.toFixed(2) + ' - ' + currentPrice.toFixed(2) + ' = ' + (originalPrice - currentPrice).toFixed(2));
                    
                    db.end();
                });
            } else {
                console.log('=== 实际装配记录（共' + accessories.length + '个）===\n');
                
                let originalPrice = 0;
                let currentPrice = 0;
                
                accessories.forEach((acc, idx) => {
                    const qty = acc.quantity || 1;
                    const pPrice = parseFloat(acc.purchase_price) || 0;
                    const uPrice = parseFloat(acc.unit_price) || 0;
                    
                    console.log(`配件${idx + 1}: ${acc.category_name} - ${acc.accessory_name}`);
                    console.log(`  品牌型号: ${acc.brand || '-'} ${acc.model || '-'}`);
                    console.log(`  数量: ${qty}`);
                    console.log(`  采购价: ${pPrice}`);
                    console.log(`  当前单价: ${uPrice}`);
                    console.log(`  采购小计: ${pPrice} × ${qty} = ${(pPrice * qty).toFixed(2)}`);
                    console.log(`  当前小计: ${uPrice} × ${qty} = ${(uPrice * qty).toFixed(2)}`);
                    console.log('');
                    
                    originalPrice += pPrice * qty;
                    currentPrice += uPrice * qty;
                });
                
                console.log('=== 财务计算公式 ===');
                console.log('原始采购价格 = Σ(配件采购价 × 数量) = ' + originalPrice.toFixed(2));
                console.log('折旧后价格 = Σ(配件当前单价 × 数量) = ' + currentPrice.toFixed(2));
                console.log('贬值金额 = 原始采购价格 - 折旧后价格 = ' + originalPrice.toFixed(2) + ' - ' + currentPrice.toFixed(2) + ' = ' + (originalPrice - currentPrice).toFixed(2));
                
                db.end();
            }
        });
    });
});
