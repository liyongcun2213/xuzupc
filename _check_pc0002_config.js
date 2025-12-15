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
    
    const productCode = 'PC0002';
    
    // 查询该产品的配置
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
            dt.created_at,
            a.id AS accessory_id,
            a.stock_quantity
        FROM device_templates dt
        LEFT JOIN accessory_categories ac ON dt.accessory_category_id = ac.id
        LEFT JOIN accessories a ON 
            a.category_id = dt.accessory_category_id AND
            a.brand = dt.brand AND
            a.model = dt.model
        WHERE dt.product_code = ?
        ORDER BY dt.accessory_category_id, dt.brand, dt.model
    `, [productCode], (err, rows) => {
        if (err) {
            console.error('查询失败:', err);
            db.end();
            return;
        }
        
        console.log(`产品编码: ${productCode}`);
        console.log(`共有 ${rows.length} 条配置记录\n`);
        
        console.log('ID\t类别ID\t类别名称\t配件名称\t\t品牌\t\t型号\t\t数量\t库存\t配件ID');
        console.log('========================================================================================');
        
        rows.forEach(row => {
            console.log(
                `${row.id}\t${row.accessory_category_id}\t${row.category_name || '-'}\t\t` +
                `${row.accessory_name || '-'}\t\t${row.brand || '-'}\t${row.model || '-'}\t` +
                `${row.quantity}\t${row.stock_quantity || 0}\t${row.accessory_id || '无匹配'}`
            );
        });
        
        // 检查是否有重复的配件类别
        const categoryCount = {};
        rows.forEach(row => {
            const catId = row.accessory_category_id;
            const catName = row.category_name || '未分类';
            const key = `${catId}:${catName}`;
            categoryCount[key] = (categoryCount[key] || 0) + 1;
        });
        
        console.log('\n\n类别统计:');
        console.log('========================');
        Object.keys(categoryCount).forEach(key => {
            const parts = key.split(':');
            const count = categoryCount[key];
            if (count > 1) {
                console.log(`⚠️  ${parts[1]} (ID:${parts[0]}): ${count} 条记录 - 有重复！`);
            } else {
                console.log(`✓  ${parts[1]} (ID:${parts[0]}): ${count} 条记录`);
            }
        });
        
        db.end();
    });
});
