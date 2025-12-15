const fs = require('fs');

// 读取server.js文件
fs.readFile('server.js', 'utf8', (err, data) => {
    if (err) {
        console.error('读取server.js文件失败:', err);
        return;
    }
    
    // 找到资产统计路由中计算配件总价值的部分
    const oldCode = `
            // 计算配件总价值和按类别统计
            const accessoryStats = {
                totalValue: 0,
                totalCount: 0
            };
            
            const accessoryDetails = {};
            
            // 按类别分组配件
            accessories.forEach(accessory => {
                const category = accessory.category_name;
                const value = parseFloat(accessory.unit_price) * parseInt(accessory.stock_quantity || 0);
                
                accessoryStats.totalValue += value;
                accessoryStats.totalCount += parseInt(accessory.stock_quantity || 0);
                
                if (!accessoryDetails[category]) {
                    accessoryDetails[category] = {
                        category: category,
                        count: 0,
                        totalValue: 0
                    };
                }
                
                accessoryDetails[category].count += parseInt(accessory.stock_quantity || 0);
                accessoryDetails[category].totalValue += value;
            });`;
    
    // 新的代码，使用批次库存数据
    const newCode = `
            // 计算配件总价值和按类别统计（使用批次库存数据）
            const accessoryStats = {
                totalValue: 0,
                totalCount: 0
            };
            
            const accessoryDetails = {};
            
            // 查询批次库存数据
            db.query(\`
                SELECT 
                    a.id AS accessory_id,
                    a.name,
                    a.brand,
                    a.category_id,
                    ac.name AS category_name,
                    SUM(abs.available_quantity) AS available_quantity,
                    SUM(abs.quantity) AS purchase_quantity,
                    SUM(abs.quantity - abs.available_quantity) AS out_quantity,
                    COALESCE(latest_price.price, a.purchase_price) AS current_price
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
                GROUP BY a.id, a.name, a.brand, a.category_id, ac.name, latest_price.price
            \`, (err, batchAccessories) => {
                if (err) {
                    console.error('查询批次配件失败:', err);
                    return res.status(500).send('服务器错误');
                }
                
                // 按类别分组配件
                batchAccessories.forEach(accessory => {
                    const category = accessory.category_name;
                    const stockQty = accessory.available_quantity || 0;
                    const value = parseFloat(accessory.current_price || 0) * stockQty;
                    
                    accessoryStats.totalValue += value;
                    accessoryStats.totalCount += stockQty;
                    
                    if (!accessoryDetails[category]) {
                        accessoryDetails[category] = {
                            category: category,
                            count: 0,
                            totalValue: 0
                        };
                    }
                    
                    accessoryDetails[category].count += stockQty;
                    accessoryDetails[category].totalValue += value;
                });
                
                // 计算配件月折旧
                Object.keys(accessoryDetails).forEach(category => {
                    const categoryDepreciationRate = depreciationSettings.find(s => s.asset_category === category)?.depreciation_rate || 0.01;
                    accessoryDetails[category].monthlyDepreciation = accessoryDetails[category].totalValue * categoryDepreciationRate;
                });`;
    
    // 找到并替换代码
    const updatedData = data.replace(oldCode, newCode);
    
    if (updatedData !== data) {
        // 写回文件
        fs.writeFile('server.js', updatedData, 'utf8', (err) => {
            if (err) {
                console.error('写入server.js文件失败:', err);
                return;
            }
            
            console.log('资产统计页面已更新为使用批次库存数据！');
        });
    } else {
        console.log('未找到需要替换的代码');
    }
});