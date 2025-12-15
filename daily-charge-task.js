/**
 * 每日自动扣费任务
 * 功能：
 * 1. 查询所有活跃租赁订单
 * 2. 计算每台设备的日租金
 * 3. 从客户账户余额中扣除
 * 4. 记录扣费明细
 * 5. 判断是否欠费
 */

const mysql = require('mysql2');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system'
});

db.on('error', (err) => {
    console.error('MySQL 连接异常:', err);
});

function executeDailyCharge() {
    console.log(`\n========== 开始执行每日扣费任务 ==========`);
    console.log(`执行时间: ${new Date().toLocaleString('zh-CN')}\n`);
    
    db.connect(err => {
        if (err) {
            console.error('数据库连接失败:', err);
            return;
        }
        
        // 查询所有活跃的租赁订单及其设备
        const sql = `

            SELECT 
                r.id as rental_id,
                r.partner_id as customer_id,
                r.product_id,
                r.rental_fee,
                r.rental_cycle,
                ri.device_id,
                d.device_code,
                p.name as customer_name,
                ca.customer_code,
                ca.balance,
                ca.status as customer_status,
                DATEDIFF(CURDATE(), r.rental_date) as rental_days
            FROM rentals r
            JOIN rental_items ri ON r.id = ri.rental_id
            JOIN devices d ON ri.device_id = d.id
            JOIN partners p ON r.partner_id = p.id
            LEFT JOIN customer_accounts ca ON r.partner_id = ca.customer_id
            WHERE r.status = 'active'
            AND d.status IN ('rented', 'in_use')
        `;
        
        db.query(sql, (err, rentals) => {
            if (err) {
                console.error('查询租赁订单失败:', err);
                db.end();
                return;
            }

            
            if (rentals.length === 0) {
                console.log('没有需要扣费的租赁订单');
                db.end();
                return;
            }
            
            console.log(`找到 ${rentals.length} 条租赁设备需要扣费\n`);
            
            let completed = 0;
            let successCount = 0;
            let failCount = 0;
            
            rentals.forEach((rental, index) => {
                // 计算日租金
                const dailyRate = calculateDailyRate(rental.rental_fee, rental.rental_cycle);
                
                console.log(`[${index + 1}/${rentals.length}] 处理租赁: ${rental.customer_name} - 设备 ${rental.device_code}`);
                console.log(`  日租金: ¥${dailyRate.toFixed(2)}, 当前余额: ¥${parseFloat(rental.balance || 0).toFixed(2)}`);
                
                // 检查今天是否已经扣费
                db.query(
                    'SELECT id FROM daily_charge_records WHERE customer_id = ? AND rental_id = ? AND device_id = ? AND charge_date = CURDATE()',
                    [rental.customer_id, rental.rental_id, rental.device_id],
                    (err, existing) => {
                        if (err) {
                            console.log(`  ✗ 检查扣费记录失败`);
                            failCount++;
                            completed++;
                            checkComplete();
                            return;
                        }
                        
                        if (existing && existing.length > 0) {
                            console.log(`  ⊙ 今天已扣费，跳过`);
                            completed++;
                            checkComplete();
                            return;
                        }
                        
                        // 执行扣费
                        chargeCustomer(rental, dailyRate, (success) => {
                            if (success) {
                                console.log(`  ✓ 扣费成功`);
                                successCount++;
                            } else {
                                console.log(`  ✗ 扣费失败`);
                                failCount++;
                            }
                            completed++;
                            checkComplete();
                        });
                    }
                );
            });
            
            function checkComplete() {
                if (completed === rentals.length) {
                    console.log(`\n========== 扣费任务完成 ==========`);
                    console.log(`总计: ${rentals.length} 条`);
                    console.log(`成功: ${successCount} 条`);
                    console.log(`失败: ${failCount} 条`);
                    console.log(`跳过: ${rentals.length - successCount - failCount} 条`);
                    console.log(`=====================================\n`);
                    db.end();
                }
            }
        });
    });
}

// 计算日租金
function calculateDailyRate(rentalFee, rentalCycle) {
    const fee = parseFloat(rentalFee);
    
    switch(rentalCycle) {
        case 'daily':
            return fee;
        case 'monthly':
            return fee / 30;
        case 'quarterly':
            return fee / 90;
        case 'yearly':
            return fee / 365;
        default:
            return fee / 30; // 默认按月计算
    }
}

// 扣费函数
function chargeCustomer(rental, dailyRate, callback) {
    db.beginTransaction(err => {
        if (err) {
            console.error('  事务启动失败:', err);
            callback(false);
            return;
        }
        
        const balanceBefore = parseFloat(rental.balance || 0);
        const chargeAmount = dailyRate;
        const balanceAfter = balanceBefore - chargeAmount;
        
        // 1. 更新客户账户
        db.query(
            `UPDATE customer_accounts 
            SET consumed_amount = consumed_amount + ?,
                balance = balance - ?,
                status = CASE 
                    WHEN balance - ? < 0 THEN 'overdue'
                    ELSE status 
                END,
                updated_at = CURRENT_TIMESTAMP
            WHERE customer_id = ?`,
            [chargeAmount, chargeAmount, chargeAmount, rental.customer_id],
            (err) => {
                if (err) {
                    console.error('  更新账户失败:', err);
                    return db.rollback(() => callback(false));
                }
                
                // 2. 插入每日扣费记录
                db.query(
                    `INSERT INTO daily_charge_records 
                    (customer_id, customer_code, customer_name, rental_id, device_id, device_code, daily_rate, charge_date, charge_amount, balance_before, balance_after)
                    VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE(), ?, ?, ?)`,
                    [rental.customer_id, rental.customer_code, rental.customer_name, rental.rental_id, rental.device_id, rental.device_code, dailyRate, chargeAmount, balanceBefore, balanceAfter],
                    (err, chargeResult) => {
                        if (err) {
                            console.error('  插入扣费记录失败:', err);
                            return db.rollback(() => callback(false));
                        }
                        
                        // 3. 插入消费明细
                        db.query(
                            `INSERT INTO customer_transaction_details 
                            (customer_id, customer_code, transaction_type, amount, balance_before, balance_after, transaction_date, related_id, notes)
                            VALUES (?, ?, 'charge', ?, ?, ?, NOW(), ?, ?)`,
                            [rental.customer_id, rental.customer_code, -chargeAmount, balanceBefore, balanceAfter, chargeResult.insertId, `设备 ${rental.device_code} 日租金`],
                            (err) => {
                                if (err) {
                                    console.error('  插入消费明细失败:', err);
                                    return db.rollback(() => callback(false));
                                }
                                
                                // 提交事务
                                db.commit(err => {
                                    if (err) {
                                        console.error('  事务提交失败:', err);
                                        return db.rollback(() => callback(false));
                                    }
                                    callback(true);
                                });
                            }
                        );
                    }
                );
            }
        );
    });
}

// 如果直接运行此文件，执行扣费
if (require.main === module) {
    executeDailyCharge();
}

module.exports = { executeDailyCharge };
