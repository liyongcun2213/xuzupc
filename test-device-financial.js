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
    
    console.log('测试设备 PC0003-001 的财务计算（使用价格历史表）\n');
    
    db.query("SELECT id, product_id FROM devices WHERE device_code = 'PC0003-001'", (err, devices) => {
        if (err || devices.length === 0) {
            console.error('设备不存在');
            db.end();
            return;
        }
        
        const device = devices[0];
        
        // 使用新的SQL查询（包含价格历史）
        db.query(`
            SELECT 
                a.name AS accessory_name,
                a.brand,
                a.model,
                COALESCE(latest_price.price, a.purchase_price) as unit_price,
                a.purchase_price,
                ac.name AS category_name,
                pa.quantity
            FROM product_accessories pa
            JOIN accessories a ON pa.accessory_id = a.id
            JOIN accessory_categories ac ON a.category_id = ac.id
            LEFT JOIN (
                SELECT aph1.*
                FROM accessory_price_history aph1
                JOIN (
                    SELECT accessory_id, MAX(month_year) as max_month_year 
                    FROM accessory_price_history 
                    GROUP BY accessory_id
                ) latest ON aph1.accessory_id = latest.accessory_id
                         AND aph1.month_year = latest.max_month_year
            ) latest_price ON a.id = latest_price.accessory_id
            WHERE pa.product_id = ?
            ORDER BY ac.name
        `, [device.product_id], (err, accessories) => {
            if (err) {
                console.error(err);
                db.end();
                return;
            }
            
            console.log('=== 配件列表（共' + accessories.length + '个）===\n');
            
            let originalPrice = 0;
            let currentPrice = 0;
            
            accessories.forEach((acc, idx) => {
                const qty = acc.quantity || 1;
                const pPrice = parseFloat(acc.purchase_price) || 0;
                const uPrice = parseFloat(acc.unit_price) || 0;
                
                console.log(`配件${idx + 1}: ${acc.category_name} - ${acc.accessory_name}`);
                console.log(`  品牌型号: ${acc.brand || '-'} ${acc.model || '-'}`);
                console.log(`  数量: ${qty}`);
                console.log(`  采购价: ¥${pPrice}`);
                console.log(`  当前价: ¥${uPrice} ${uPrice === pPrice ? '(无价格历史,使用采购价)' : '(来自价格历史表)'}`);
                console.log(`  采购小计: ¥${(pPrice * qty).toFixed(2)}`);
                console.log(`  当前小计: ¥${(uPrice * qty).toFixed(2)}`);
                console.log('');
                
                originalPrice += pPrice * qty;
                currentPrice += uPrice * qty;
            });
            
            const depreciation = originalPrice - currentPrice;
            
            console.log('=== 财务计算结果 ===');
            console.log('原始采购价格 = ¥' + originalPrice.toFixed(2));
            console.log('折旧后价格   = ¥' + currentPrice.toFixed(2));
            console.log('贬值金额     = ¥' + depreciation.toFixed(2));
            console.log('');
            console.log('公式：');
            console.log('  原始采购价格 = Σ(配件采购价 × 数量)');
            console.log('  折旧后价格   = Σ(配件当前价 × 数量)');
            console.log('  贬值金额     = 原始采购价格 - 折旧后价格');
            
            db.end();
        });
    });
});
