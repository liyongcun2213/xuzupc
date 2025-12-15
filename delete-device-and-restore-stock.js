const mysql = require('mysql');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system'
});

db.connect();

const deviceCode = 'PC0008';

console.log(`准备删除设备 ${deviceCode} 并恢复配件库存...\n`);

// 查询设备信息
db.query('SELECT * FROM devices WHERE device_code = ?', [deviceCode], (err, devices) => {
    if (err) {
        console.error('查询设备失败:', err);
        db.end();
        return;
    }
    
    if (devices.length === 0) {
        console.log(`设备 ${deviceCode} 不存在`);
        db.end();
        return;
    }
    
    const device = devices[0];
    console.log('找到设备:');
    console.table([device]);
    
    // 查询设备使用的配件
    db.query(`
        SELECT da.*, a.stock_quantity as current_stock
        FROM device_assemblies da
        JOIN accessories a ON da.accessory_id = a.id
        WHERE da.device_id = ?
    `, [device.id], (err2, assemblies) => {
        if (err2) {
            console.error('查询设备配件失败:', err2);
            db.end();
            return;
        }
        
        console.log(`\n设备使用的配件 (${assemblies.length}个):`);
        console.table(assemblies);
        
        // 开始事务
        db.beginTransaction((err3) => {
            if (err3) {
                console.error('开启事务失败:', err3);
                db.end();
                return;
            }
            
            console.log('\n开始删除设备并恢复配件库存...');
            
            // 恢复配件库存
            let restoreCount = 0;
            const restorePromises = [];
            
            assemblies.forEach(assembly => {
                const promise = new Promise((resolve, reject) => {
                    db.query(`
                        UPDATE accessories
                        SET stock_quantity = stock_quantity + ?,
                            status = CASE
                                WHEN stock_quantity + ? > 0 THEN 'in_warehouse'
                                ELSE status
                            END
                        WHERE id = ?
                    `, [assembly.quantity, assembly.quantity, assembly.accessory_id], (err) => {
                        if (err) {
                            console.error(`  - 恢复配件 ${assembly.accessory_name} 库存失败:`, err.message);
                            reject(err);
                        } else {
                            console.log(`  ✓ 恢复配件 ${assembly.accessory_name} 库存 +${assembly.quantity} (原库存: ${assembly.current_stock})`);
                            resolve();
                        }
                    });
                });
                restorePromises.push(promise);
            });
            
            Promise.all(restorePromises)
                .then(() => {
                    console.log('\n所有配件库存恢复完成');
                    
                    // 删除设备组装记录
                    db.query('DELETE FROM device_assemblies WHERE device_id = ?', [device.id], (err4) => {
                        if (err4) {
                            console.error('删除设备组装记录失败:', err4);
                            return db.rollback(() => db.end());
                        }
                        
                        console.log('✓ 设备组装记录已删除');
                        
                        // 删除设备
                        db.query('DELETE FROM devices WHERE id = ?', [device.id], (err5) => {
                            if (err5) {
                                console.error('删除设备失败:', err5);
                                return db.rollback(() => db.end());
                            }
                            
                            console.log(`✓ 设备 ${deviceCode} 已删除`);
                            
                            // 提交事务
                            db.commit((err6) => {
                                if (err6) {
                                    console.error('提交事务失败:', err6);
                                    return db.rollback(() => db.end());
                                }
                                
                                console.log('\n✓ 事务提交成功！设备已删除，配件库存已恢复。');
                                db.end();
                            });
                        });
                    });
                })
                .catch(err => {
                    console.error('恢复配件库存失败:', err);
                    db.rollback(() => db.end());
                });
        });
    });
});
