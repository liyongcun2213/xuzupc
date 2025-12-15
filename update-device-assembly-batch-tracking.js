// 这个脚本将修改设备组装逻辑，使其使用批次跟踪系统

const fs = require('fs');

// 读取原始的 server.js 文件
const serverPath = './server.js';
const serverContent = fs.readFileSync(serverPath, 'utf8');

// 找到设备组装的函数并替换
const assembleFunctionStart = `// 执行设备组装`;
const assembleFunctionEnd = `});`;

// 找到组装函数的开始位置
const startIndex = serverContent.indexOf(assembleFunctionStart);
if (startIndex === -1) {
    console.error('未找到设备组装函数的开始位置');
    process.exit(1);
}

// 找到下一个路由的开始位置，确定组装函数的结束位置
const nextRouteIndex = serverContent.indexOf('app.post', startIndex + 1);
if (nextRouteIndex === -1) {
    console.error('未找到设备组装函数的结束位置');
    process.exit(1);
}

// 新的设备组装函数
const newAssembleFunction = `// 执行设备组装 - 使用批次跟踪系统
app.post('/devices/assemble', isAuthenticated, (req, res) => {
    const { productId, quantity } = req.body;
    
    console.log('收到组装请求:', { productId, quantity });
    
    if (!productId || !quantity) {
        return res.status(400).json({ success: false, message: '参数不完整：缺少产品ID或数量' });
    }
    
    const assembleQuantity = parseInt(quantity);
    if (assembleQuantity <= 0) {
        return res.status(400).json({ success: false, message: '数量必须大于0' });
    }
    
    // 获取产品信息
    db.query('SELECT * FROM products WHERE id = ?', [productId], (err, products) => {
        if (err) {
            console.error('查询产品错误:', err);
            return res.status(500).json({ success: false, message: '服务器错误' });
        }
        
        if (products.length === 0) {
            return res.status(400).json({ success: false, message: '产品不存在' });
        }
        
        const product = products[0];
        const productCode = product.product_code || product.code;
        
        console.log('找到产品:', product.name, '编码:', productCode);
        
        // 如果产品没有编码或未维护模板，则禁止组装
        if (!productCode) {
            console.log('产品无编码，禁止组装');
            return res.status(400).json({ 
                success: false, 
                message: '该产品没有产品编号或配件模板，不能组装电脑。请先在产品管理中生成产品型号并配置配件。' 
            });
        }
        
        // 从device_templates获取该产品的配件清单
        db.query(\`
            SELECT dt.*, a.name as accessory_name, a.brand, a.model, a.id as accessory_id
            FROM device_templates dt
            LEFT JOIN accessories a ON 
                a.category_id = dt.accessory_category_id AND
                a.brand = dt.brand AND
                a.model = dt.model
            WHERE dt.product_code = ?
            ORDER BY dt.accessory_category_id
        \`, [productCode], (err, templateAccessories) => {
            if (err) {
                console.error('查询配件模板错误:', err);
                return res.status(500).json({ success: false, message: '查询配件模板失败' });
            }
            
            console.log('查询到的模板配件数量:', templateAccessories.length);
            console.log('模板配件详情:', JSON.stringify(templateAccessories.slice(0, 3), null, 2));
            
            if (templateAccessories.length === 0) {
                console.log('无配件模板，禁止组装');
                return res.status(400).json({ 
                    success: false, 
                    message: '该产品未维护配件模板，不能组装电脑。请在产品管理中配置配件并同步模板后再试。' 
                });
            }

            // 前端传入的配件数量配置
            const clientAccessories = Array.isArray(req.body.accessories) ? req.body.accessories : [];
            const clientQuantityMap = new Map();
            
            for (const item of clientAccessories) {
                const accessoryId = parseInt(item.accessoryId || item.accessory_id, 10);
                const perDeviceQuantity = parseInt(item.quantity, 10);
                if (!accessoryId || !perDeviceQuantity || perDeviceQuantity <= 0) {
                    continue;
                }
                clientQuantityMap.set(accessoryId, perDeviceQuantity);
            }

            if (clientQuantityMap.size === 0) {
                console.log('前端未提供有效的配件数量配置，禁止组装');
                return res.status(400).json({ 
                    success: false, 
                    message: '未提供配件数量配置，不能组装电脑。请在产品配置详情中为每个部件设置数量。' 
                });
            }
            
            // 检查是否是电脑主机产品（使用 products.is_host 标记）
            if (!product.is_host) {
                return res.status(400).json({
                    success: false,
                    message: '该产品未标记为电脑主机，不能执行配件组装流程。请在产品管理中设置为电脑主机后再试。'
                });
            }
            
            // 开始事务
            db.beginTransaction(err => {
                if (err) {
                    console.error(err);
                    return res.status(500).json({ success: false, message: '事务启动失败' });
                }
                
                // 1. 检查所有配件的库存是否足够
                let checkCompleted = 0;
                const insufficientStock = [];
                const validAccessories = [];
                
                templateAccessories.forEach(templateItem => {
                    // 从前端配置中获取每台设备需要的数量
                    const perDeviceQuantity = clientQuantityMap.get(templateItem.accessory_id);
                    if (!perDeviceQuantity || perDeviceQuantity <= 0) {
                        insufficientStock.push(\`\${templateItem.accessory_name} - 未提供数量或数量无效\`);
                        checkCompleted++;
                        return;
                    }
                    
                    // 查询该配件的总可用库存（所有批次的可用数量总和）
                    db.query(\`
                        SELECT SUM(available_quantity) as total_available
                        FROM accessory_batch_stock
                        WHERE accessory_id = ? AND status = 'in_stock'
                    \`, [templateItem.accessory_id], (err, result) => {
                        if (err) {
                            return db.rollback(() => {
                                res.status(500).json({ success: false, message: '检查配件库存失败' });
                            });
                        }
                        
                        const totalAvailable = (result[0] && result[0].total_available) || 0;
                        const requiredQuantity = perDeviceQuantity * assembleQuantity;
                        
                        if (totalAvailable < requiredQuantity) {
                            insufficientStock.push(\`\${templateItem.accessory_name} (\${templateItem.brand} \${templateItem.model}) - 需要: \${requiredQuantity}, 可用: \${totalAvailable}\`);
                        } else {
                            validAccessories.push({
                                accessoryId: templateItem.accessory_id,
                                accessoryName: templateItem.accessory_name,
                                brand: templateItem.brand,
                                model: templateItem.model,
                                quantity: perDeviceQuantity
                            });
                        }
                        
                        checkCompleted++;
                        if (checkCompleted === templateAccessories.length) {
                            if (insufficientStock.length > 0) {
                                return db.rollback(() => {
                                    res.status(400).json({ 
                                        success: false, 
                                        message: '以下配件库存不足：' + insufficientStock.join(', ') 
                                    });
                                });
                            }
                            
                            // 所有配件库存足够，开始创建设备
                            createDevicesWithAccessories(product, assembleQuantity, validAccessories, res, db);
                        }
                    });
                });
            });
        });
    });
});

// 创建不带配件的设备
function createDevicesWithoutAccessories(product, quantity, res) {
    const devices = [];
    
    // 创建设备记录
    for (let i = 0; i < quantity; i++) {
        const deviceCode = \`\${product.product_code || 'DEV'}\${moment().format('YYYYMMDD')}\${String(i + 1).padStart(3, '0')}\`;
        devices.push({
            code: deviceCode,
            product_id: product.id,
            status: 'available'
        });
    }
    
    // 插入设备记录
    let inserted = 0;
    devices.forEach(device => {
        db.query(\`
            INSERT INTO devices (code, product_id, status, created_at) 
            VALUES (?, ?, ?, NOW())
        \`, [device.code, device.product_id, device.status], (err, result) => {
            if (err) {
                console.error('插入设备记录失败:', err);
                return res.status(500).json({ success: false, message: '创建设备记录失败' });
            }
            
            inserted++;
            if (inserted === devices.length) {
                res.json({
                    success: true,
                    message: \`成功创建 \${quantity} 台设备\`,
                    devices: devices
                });
            }
        });
    });
}

// 创建带配件的设备（使用批次跟踪系统）
function createDevicesWithAccessories(product, quantity, accessories, res, db) {
    // 获取当前产品的最大设备编号
    db.query(\`
        SELECT device_code
        FROM devices
        WHERE product_code = ?
        ORDER BY device_code DESC
        LIMIT 1
    \`, [product.product_code || product.code], (err, maxDeviceResult) => {
        if (err) {
            console.error('查询设备编号错误:', err);
            return db.rollback(() => {
                res.status(500).json({ success: false, message: '查询设备编号失败: ' + err.message });
            });
        }
        
        let nextDeviceSeq = 1;
        if (maxDeviceResult && maxDeviceResult.length > 0) {
            const maxDeviceCode = maxDeviceResult[0].device_code || '';
            const parts = maxDeviceCode.split('-');
            if (parts.length > 1) {
                const currentSeq = parseInt(parts[1], 10);
                if (!Number.isNaN(currentSeq)) {
                    nextDeviceSeq = currentSeq + 1;
                }
            }
        }
        
        const devices = [];
        for (let i = 0; i < quantity; i++) {
            const deviceSeq = nextDeviceSeq + i;
            const deviceCode = \`\${product.product_code || product.code}-\${deviceSeq.toString().padStart(3, '0')}\`;
            devices.push({
                code: deviceCode,
                product_id: product.id,
                product_code: product.product_code || product.code,
                device_name: product.name,
                status: 'in_warehouse'
            });
        }
        
        // 先插入所有设备记录
        let deviceInserted = 0;
        const deviceIds = [];
        
        devices.forEach((device, index) => {
            db.query(\`
                INSERT INTO devices (
                    device_code, product_id, product_code, device_name, 
                    status, assembly_date, created_at, updated_at
                ) VALUES (?, ?, ?, ?, 'in_warehouse', NOW(), NOW(), NOW())
            \`, [device.code, device.product_id, device.product_code, device.device_name], (err, result) => {
                if (err) {
                    return db.rollback(() => {
                        res.status(500).json({ success: false, message: '创建设备记录失败' });
                    });
                }
                
                deviceIds[index] = result.insertId;
                deviceInserted++;
                
                if (deviceInserted === devices.length) {
                    // 所有设备创建完成，开始分配配件
                    let devicesCompleted = 0;
                    
                    devices.forEach((device, deviceIndex) => {
                        const deviceId = deviceIds[deviceIndex];
                        let accessoriesCompleted = 0;
                        
                        // 为每台设备分配配件
                        accessories.forEach(acc => {
                            const { accessoryId, quantity: accQuantity } = acc;
                            
                            // 调用存储过程分配批次（先进先出）
                            db.query(\`
                                CALL allocate_accessory_batches(?, ?, ?, @allocated, @needed);
                                SELECT @allocated AS allocated, @needed AS needed;
                            \`, [deviceId, accessoryId, accQuantity], (err, result) => {
                                if (err) {
                                    console.error('分配批次失败:', err);
                                    return db.rollback(() => {
                                        res.status(500).json({ success: false, message: '分配配件批次失败' });
                                    });
                                }
                                
                                const allocationResult = result[result.length - 1][0]; // 获取存储过程的结果
                                const allocated = allocationResult.allocated || 0;
                                
                                if (allocated < accQuantity) {
                                    return db.rollback(() => {
                                        res.status(400).json({ 
                                            success: false, 
                                            message: \`配件 \${accessoryId} 分配失败：需要 \${accQuantity} 个，只分配到 \${allocated} 个\` 
                                        });
                                    });
                                }
                                
                                accessoriesCompleted++;
                                if (accessoriesCompleted === accessories.length) {
                                    devicesCompleted++;
                                    if (devicesCompleted === devices.length) {
                                        // 所有设备和配件都分配完成，提交事务
                                        db.commit(err => {
                                            if (err) {
                                                return db.rollback(() => {
                                                    res.status(500).json({ success: false, message: '事务提交失败' });
                                                });
                                            }
                                            
                                            // 添加设备ID到设备对象
                                            devices.forEach((device, index) => {
                                                device.id = deviceIds[index];
                                            });
                                            
                                            res.json({
                                                success: true,
                                                message: \`成功组装 \${quantity} 台设备\`,
                                                devices: devices
                                            });
                                        });
                                    }
                                }
                            });
                        });
                    });
                }
            });
        });
    });
}`;

// 替换原有代码
const newServerContent = serverContent.substring(0, startIndex) + 
                         newAssembleFunction + 
                         serverContent.substring(nextRouteIndex);

// 写入修改后的内容
fs.writeFileSync(serverPath, newServerContent, 'utf8');
console.log('设备组装函数已更新，现在使用批次跟踪系统');