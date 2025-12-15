// 租金管理定时任务
const mysql = require('mysql2');
const moment = require('moment');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system'
});

db.on('error', (err) => {
    console.error('MySQL 连接异常:', err);
});

// 更新逾期状态
function updateOverdueStatus() {
    return new Promise((resolve, reject) => {
        const today = moment().format('YYYY-MM-DD');
        
        const updateQuery = `
            UPDATE rent_receivable_bills
            SET 
                status = CASE 
                    WHEN status IN ('pending', 'partial') AND due_date < ? THEN 'overdue'
                    ELSE status
                END,
                overdue_days = CASE 
                    WHEN status IN ('pending', 'partial', 'overdue') AND due_date < ? 
                    THEN DATEDIFF(?, due_date)
                    ELSE overdue_days
                END
            WHERE status IN ('pending', 'partial', 'overdue')
        `;
        
        db.query(updateQuery, [today, today, today], (err, result) => {
            if (err) {
                console.error('[租金管理] 更新逾期状态失败:', err);
                return reject(err);
            }
            
            console.log(`[租金管理] 逾期状态更新成功，影响 ${result.affectedRows} 条记录`);
            resolve(result.affectedRows);
        });
    });
}

// 生成提前5天预警
function generatePaymentAlerts() {
    return new Promise((resolve, reject) => {
        const targetDate = moment().add(5, 'days').format('YYYY-MM-DD');
        
        // 查询即将到期的账单
        const billQuery = `
            SELECT *
            FROM rent_receivable_bills
            WHERE status = 'pending' AND due_date = ?
        `;
        
        db.query(billQuery, [targetDate], (err, bills) => {
            if (err) {
                console.error('[租金管理] 查询即将到期账单失败:', err);
                return reject(err);
            }
            
            if (bills.length === 0) {
                console.log('[租金管理] 没有需要预警的账单');
                return resolve(0);
            }
            
            // 检查是否已存在预警
            const billIds = bills.map(b => b.id);
            const existingAlertsQuery = `
                SELECT bill_id FROM rent_payment_alerts
                WHERE bill_id IN (?) AND alert_status = 'active'
            `;
            
            db.query(existingAlertsQuery, [billIds], (err, existingAlerts) => {
                if (err) {
                    console.error('[租金管理] 查询现有预警失败:', err);
                    return reject(err);
                }
                
                const existingBillIds = new Set(existingAlerts.map(a => a.bill_id));
                const newBills = bills.filter(b => !existingBillIds.has(b.id));
                
                if (newBills.length === 0) {
                    console.log('[租金管理] 预警已存在');
                    return resolve(0);
                }
                
                // 插入新预警
                const insertQuery = `
                    INSERT INTO rent_payment_alerts
                    (bill_id, bill_number, customer_id, customer_name, due_date, bill_amount, days_before_due, alert_type)
                    VALUES ?
                `;
                
                const values = newBills.map(b => [
                    b.id, b.bill_number, b.customer_id, b.customer_name,
                    b.due_date, b.bill_amount, 5, 'payment_due'
                ]);
                
                db.query(insertQuery, [values], (err, result) => {
                    if (err) {
                        console.error('[租金管理] 生成预警失败:', err);
                        return reject(err);
                    }
                    
                    console.log(`[租金管理] 成功生成 ${newBills.length} 条预警`);
                    resolve(newBills.length);
                });
            });
        });
    });
}

// 执行所有定时任务
async function executeRentManagementTasks() {
    console.log('\n========== 租金管理定时任务开始 ==========');
    console.log('执行时间:', moment().format('YYYY-MM-DD HH:mm:ss'));
    
    try {
        // 1. 更新逾期状态
        const overdueCount = await updateOverdueStatus();
        
        // 2. 生成预警
        const alertCount = await generatePaymentAlerts();
        
        console.log('========== 租金管理定时任务完成 ==========\n');
        
        return { success: true, overdueCount, alertCount };
    } catch (error) {
        console.error('========== 租金管理定时任务失败 ==========');
        console.error(error);
        return { success: false, error };
    }
}

// 如果直接运行此文件，则执行一次任务
if (require.main === module) {
    db.connect((err) => {
        if (err) {
            console.error('数据库连接失败:', err);
            process.exit(1);
        }
        
        executeRentManagementTasks().then(() => {
            db.end();
            process.exit(0);
        }).catch(err => {
            console.error(err);
            db.end();
            process.exit(1);
        });
    });
}

module.exports = {
    executeRentManagementTasks,
    updateOverdueStatus,
    generatePaymentAlerts
};
