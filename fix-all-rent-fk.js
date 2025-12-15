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
    console.log('已连接到数据库\n');

    // 修复 rent_bad_debt_approvals 外键
    const fixBadDebtFK = () => {
        return new Promise((resolve, reject) => {
            console.log('正在修复 rent_bad_debt_approvals 表的外键约束...');
            
            // 先删除旧外键
            db.query('ALTER TABLE rent_bad_debt_approvals DROP FOREIGN KEY rent_bad_debt_approvals_ibfk_1', (err) => {
                if (err && err.errno !== 1091) {
                    console.log('  ⚠ 无需删除旧外键或删除失败:', err.message);
                } else {
                    console.log('  ✓ 已删除旧的外键约束');
                }

                // 添加新外键
                db.query('ALTER TABLE rent_bad_debt_approvals ADD CONSTRAINT rent_bad_debt_approvals_ibfk_1 FOREIGN KEY (bill_id) REFERENCES customer_bills(id)', (err) => {
                    if (err) {
                        console.error('  ✗ 添加新外键失败:', err.message);
                        reject(err);
                    } else {
                        console.log('  ✓ 已添加新的外键约束（引用 customer_bills）\n');
                        resolve();
                    }
                });
            });
        });
    };

    // 修复 rent_payment_alerts 外键
    const fixAlertsFK = () => {
        return new Promise((resolve, reject) => {
            console.log('正在修复 rent_payment_alerts 表的外键约束...');
            
            // 先删除旧外键
            db.query('ALTER TABLE rent_payment_alerts DROP FOREIGN KEY rent_payment_alerts_ibfk_1', (err) => {
                if (err && err.errno !== 1091) {
                    console.log('  ⚠ 无需删除旧外键或删除失败:', err.message);
                } else {
                    console.log('  ✓ 已删除旧的外键约束');
                }

                // 添加新外键
                db.query('ALTER TABLE rent_payment_alerts ADD CONSTRAINT rent_payment_alerts_ibfk_1 FOREIGN KEY (bill_id) REFERENCES customer_bills(id)', (err) => {
                    if (err) {
                        console.error('  ✗ 添加新外键失败:', err.message);
                        reject(err);
                    } else {
                        console.log('  ✓ 已添加新的外键约束（引用 customer_bills）\n');
                        resolve();
                    }
                });
            });
        });
    };

    // 按顺序执行修复
    fixBadDebtFK()
        .then(() => fixAlertsFK())
        .then(() => {
            console.log('====================================');
            console.log('✓ 所有租金管理表的外键约束已修复完成！');
            console.log('====================================\n');
            
            // 验证所有表
            db.query('SHOW CREATE TABLE rent_received_records', (err, results) => {
                if (!err) {
                    console.log('【rent_received_records】外键约束:');
                    const createStmt = results[0]['Create Table'];
                    const fkMatches = createStmt.match(/CONSTRAINT.*FOREIGN KEY.*\n/g);
                    fkMatches.forEach(fk => console.log('  ' + fk.trim()));
                    console.log('');
                }

                db.query('SHOW CREATE TABLE rent_bad_debt_approvals', (err, results) => {
                    if (!err) {
                        console.log('【rent_bad_debt_approvals】外键约束:');
                        const createStmt = results[0]['Create Table'];
                        const fkMatches = createStmt.match(/CONSTRAINT.*FOREIGN KEY.*\n/g);
                        fkMatches.forEach(fk => console.log('  ' + fk.trim()));
                        console.log('');
                    }

                    db.query('SHOW CREATE TABLE rent_payment_alerts', (err, results) => {
                        if (!err) {
                            console.log('【rent_payment_alerts】外键约束:');
                            const createStmt = results[0]['Create Table'];
                            const fkMatches = createStmt.match(/CONSTRAINT.*FOREIGN KEY.*\n/g);
                            fkMatches.forEach(fk => console.log('  ' + fk.trim()));
                        }

                        db.end();
                        console.log('\n✓ 完成！现在可以正常使用租金管理模块了。');
                    });
                });
            });
        })
        .catch(err => {
            console.error('\n✗ 修复失败:', err);
            db.end();
            process.exit(1);
        });
});
