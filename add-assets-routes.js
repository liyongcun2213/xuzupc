const fs = require('fs');

// 读取server.js文件
fs.readFile('server.js', 'utf8', (err, data) => {
    if (err) {
        console.error('读取server.js文件失败:', err);
        return;
    }
    
    // 找到插入位置（在产品路由之后）
    const insertMarker = "// 编辑产品页面";
    const insertIndex = data.indexOf(insertMarker);
    
    if (insertIndex === -1) {
        console.error('未找到插入位置');
        return;
    }
    
    // 新的资产统计路由代码
    const assetRoutes = `
// 资产统计页面
app.get('/assets', isAuthenticated, (req, res) => {
    // 计算设备总价值
    db.query(\`
        SELECT d.*, p.name as product_name, p.category_id, c.name as category_name
        FROM devices d
        JOIN products p ON d.product_id = p.id
        JOIN product_categories c ON p.category_id = c.id
        WHERE d.status != 'retired'
    \`, (err, devices) => {
        if (err) {
            console.error('查询设备失败:', err);
            return res.status(500).send('服务器错误');
        }
        
        // 计算配件总价值
        db.query(\`
            SELECT a.*, ac.name as category_name
            FROM accessories a
            JOIN accessory_categories ac ON a.category_id = ac.id
            WHERE a.status = 'active'
        \`, (err, accessories) => {
            if (err) {
                console.error('查询配件失败:', err);
                return res.status(500).send('服务器错误');
            }
            
            // 获取折旧设置
            db.query('SELECT * FROM depreciation_settings', (err, depreciationSettings) => {
                if (err) {
                    console.error('查询折旧设置失败:', err);
                    return res.status(500).send('服务器错误');
                }
                
                // 计算设备总价值和按类别统计
                const deviceStats = {
                    totalValue: 0,
                    totalCount: 0
                };
                
                const deviceDetails = {};
                
                // 按类别分组设备
                devices.forEach(device => {
                    const category = device.category_name;
                    const value = parseFloat(device.purchase_price) || 0;
                    
                    deviceStats.totalValue += value;
                    deviceStats.totalCount += 1;
                    
                    if (!deviceDetails[category]) {
                        deviceDetails[category] = {
                            category: category,
                            count: 0,
                            totalValue: 0
                        };
                    }
                    
                    deviceDetails[category].count += 1;
                    deviceDetails[category].totalValue += value;
                });
                
                // 获取设备折旧率
                const deviceDepreciationRate = depreciationSettings.find(s => s.asset_category === '整机')?.depreciation_rate || 0.0083;
                
                // 计算设备月折旧
                Object.keys(deviceDetails).forEach(category => {
                    deviceDetails[category].monthlyDepreciation = deviceDetails[category].totalValue * deviceDepreciationRate;
                });
                
                // 转换为数组
                const deviceDetailsArray = Object.values(deviceDetails);
                
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
                });
                
                // 计算配件月折旧
                Object.keys(accessoryDetails).forEach(category => {
                    const categoryDepreciationRate = depreciationSettings.find(s => s.asset_category === category)?.depreciation_rate || 0.01;
                    accessoryDetails[category].monthlyDepreciation = accessoryDetails[category].totalValue * categoryDepreciationRate;
                });
                
                // 转换为数组
                const accessoryDetailsArray = Object.values(accessoryDetails);
                
                // 计算总统计
                const totalStats = {
                    totalValue: deviceStats.totalValue + accessoryStats.totalValue,
                    monthlyDepreciation: Object.values(deviceDetails).reduce((sum, d) => sum + d.monthlyDepreciation, 0) + 
                                      Object.values(accessoryDetails).reduce((sum, a) => sum + a.monthlyDepreciation, 0)
                };
                
                // 获取历史数据（最近6个月）
                db.query(\`
                    SELECT * FROM asset_statistics 
                    WHERE stat_date >= DATE_SUB(CURRENT_DATE, INTERVAL 6 MONTH)
                    ORDER BY stat_date ASC
                \`, (err, historicalData) => {
                    if (err) {
                        console.error('查询历史数据失败:', err);
                        historicalData = [];
                    }
                    
                    // 准备图表数据
                    const chartLabels = [];
                    const deviceValues = [];
                    const accessoryValues = [];
                    const totalValues = [];
                    
                    // 添加当前月份数据
                    const currentDate = new Date();
                    const currentMonth = currentDate.toISOString().slice(0, 7); // YYYY-MM
                    
                    // 如果历史数据中没有当前月份，添加当前数据
                    if (!historicalData.find(d => d.stat_date.toISOString().slice(0, 7) === currentMonth)) {
                        historicalData.push({
                            stat_date: currentDate,
                            asset_type: 'device',
                            total_value: deviceStats.totalValue,
                            total_count: deviceStats.totalCount
                        });
                        
                        historicalData.push({
                            stat_date: currentDate,
                            asset_type: 'accessory',
                            total_value: accessoryStats.totalValue,
                            total_count: accessoryStats.totalCount
                        });
                    }
                    
                    // 按月份组织数据
                    const monthlyData = {};
                    historicalData.forEach(record => {
                        const month = record.stat_date.toISOString().slice(0, 7);
                        if (!monthlyData[month]) {
                            monthlyData[month] = {
                                device: 0,
                                accessory: 0
                            };
                        }
                        
                        if (record.asset_type === 'device') {
                            monthlyData[month].device = record.total_value;
                        } else if (record.asset_type === 'accessory') {
                            monthlyData[month].accessory = record.total_value;
                        }
                    });
                    
                    // 生成图表数据
                    const sortedMonths = Object.keys(monthlyData).sort();
                    
                    sortedMonths.forEach(month => {
                        chartLabels.push(month);
                        deviceValues.push(monthlyData[month].device);
                        accessoryValues.push(monthlyData[month].accessory);
                        totalValues.push(monthlyData[month].device + monthlyData[month].accessory);
                    });
                    
                    const chartData = {
                        labels: chartLabels,
                        deviceValues: deviceValues,
                        accessoryValues: accessoryValues,
                        totalValues: totalValues
                    };
                    
                    res.render('assets/index-new', {
                        deviceStats,
                        accessoryStats,
                        totalStats,
                        deviceDetails: deviceDetailsArray,
                        accessoryDetails: accessoryDetailsArray,
                        chartData,
                        user: req.session.user,
                        active: 'assets',
                        pageTitle: '资产统计'
                    });
                });
            });
        });
    });
});

`;

    // 插入路由代码
    const newContent = data.substring(0, insertIndex) + assetRoutes + data.substring(insertIndex);
    
    // 写回文件
    fs.writeFile('server.js', newContent, 'utf8', (err) => {
        if (err) {
            console.error('写入server.js文件失败:', err);
            return;
        }
        
        console.log('资产统计路由添加成功！');
    });
});