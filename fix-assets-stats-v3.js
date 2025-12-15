const fs = require('fs');

// 读取add-assets-routes.js文件
fs.readFile('add-assets-routes.js', 'utf8', (err, data) => {
    if (err) {
        console.error('读取add-assets-routes.js文件失败:', err);
        return;
    }
    
    // 查询配件的原始SQL语句
    const oldQuery = `SELECT a.*, ac.name as category_name
            FROM accessories a
            JOIN accessory_categories ac ON a.category_id = ac.id
            WHERE a.status = 'active'`;
    
    // 新的SQL语句，使用批次库存数据
    const newQuery = `SELECT 
                a.id AS accessory_id,
                a.name,
                a.brand,
                a.category_id,
                ac.name AS category_name,
                SUM(abs.available_quantity) AS stock_quantity,
                COALESCE(latest_price.price, a.purchase_price) AS unit_price
            FROM accessory_batch_stock abs
            JOIN accessories a ON abs.accessory_id = a.id
            LEFT JOIN accessory_categories ac ON a.category_id = ac.id
            LEFT JOIN (
                SELECT aph1.*
                FROM accessory_price_history aph1
                JOIN (
                    SELECT accessory_id, MAX(month_year) AS max_month_year 
                    FROM accessory_price_history 
                    GROUP BY accessory_id
                ) latest ON aph1.accessory_id = latest.accessory_id 
                         AND aph1.month_year = latest.max_month_year
            ) latest_price ON a.id = latest_price.accessory_id
            WHERE a.status != 'scrapped'
            GROUP BY a.id, a.name, a.brand, a.category_id, ac.name, latest_price.price`;
    
    // 找到并替换代码
    const updatedData = data.replace(oldQuery, newQuery);
    
    if (updatedData !== data) {
        // 写回文件
        fs.writeFile('add-assets-routes.js', updatedData, 'utf8', (err) => {
            if (err) {
                console.error('写入add-assets-routes.js文件失败:', err);
                return;
            }
            
            console.log('资产统计页面已更新为使用批次库存数据！');
        });
    } else {
        console.log('未找到需要替换的代码');
    }
});