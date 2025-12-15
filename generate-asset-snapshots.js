const mysql = require('mysql2');
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system'
});

console.log('连接到MySQL数据库...');

// 清空现有快照数据
db.query('DELETE FROM asset_snapshots', (err) => {
    if (err) {
        console.error('清空快照数据失败:', err);
        process.exit(1);
    }
    
    console.log('已清空现有快照数据');
    
    const today = new Date();
    // 从最近6个月开始生成
    const startDate = new Date(today.getFullYear(), today.getMonth() - 5, 1); // 6个月前
    const startYear = startDate.getFullYear();
    const startMonth = startDate.getMonth();
    const endYear = today.getFullYear();
    const endMonth = today.getMonth(); // 当前月
    
    console.log(`生成从${startYear}年${startMonth+1}月到${endYear}年${endMonth+1}月的资产快照...`);
    
    let completed = 0;
    
    // 生成每月快照
    function generateMonthSnapshot(year, month) {
        return new Promise((resolve, reject) => {
            const snapshotDate = new Date(year, month, 1);
            const nextMonth = new Date(year, month + 1, 1);
            
            // 1) 截至该月的设备总数与总价值（累计值）
            const deviceSql = `
                SELECT 
                    COUNT(*) AS device_count,
                    COALESCE(SUM(d.purchase_price), 0) AS device_total_value
                FROM devices d
                WHERE d.created_at < ?
            `;
            
            db.query(deviceSql, [nextMonth], (deviceErr, deviceRows) => {
                if (deviceErr) {
                    console.error(`统计${year}年${month+1}月设备失败:`, deviceErr);
                    return reject(deviceErr);
                }
                
                const deviceCount = parseInt(deviceRows[0]?.device_count || 0, 10);
                const deviceTotalValue = parseFloat(deviceRows[0]?.device_total_value || 0);
                
                // 2) 截至该月的配件总数与总价值（累计值）
                const accessorySql = `
                    SELECT 
                        COALESCE(SUM(pai.quantity), 0) AS accessory_count,
                        COALESCE(SUM(pai.quantity * pai.unit_price), 0) AS accessory_total_value
                    FROM purchase_accessory_items pai
                    JOIN purchase_batches pb ON pai.batch_id = pb.id
                    WHERE pb.purchase_date < ?
                `;
                
                db.query(accessorySql, [nextMonth], (accessoryErr, accessoryRows) => {
                    if (accessoryErr) {
                        console.error(`统计${year}年${month+1}月配件失败:`, accessoryErr);
                        return reject(accessoryErr);
                    }
                    
                    const accessoryCount = parseInt(accessoryRows[0]?.accessory_count || 0, 10);
                    const accessoryTotalValue = parseFloat(accessoryRows[0]?.accessory_total_value || 0);
                    
                    // 插入新记录
                    db.query(
                        `
                        INSERT INTO asset_snapshots (
                            snapshot_date,
                            device_count,
                            device_total_value,
                            accessory_count,
                            accessory_total_value
                        ) VALUES (?, ?, ?, ?, ?)
                        `,
                        [
                            snapshotDate,
                            deviceCount,
                            deviceTotalValue,
                            accessoryCount,
                            accessoryTotalValue
                        ],
                        (insertErr) => {
                            if (insertErr) {
                                console.error(`插入${year}年${month+1}月资产快照失败:`, insertErr);
                                return reject(insertErr);
                            }
                            
                            console.log(`${year}年${month+1}月快照已生成: 设备${deviceCount}台(¥${deviceTotalValue}), 配件${accessoryCount}件(¥${accessoryTotalValue})`);
                            resolve();
                        }
                    );
                });
            });
        });
    }
    
    // 按顺序生成每个月的快照
    async function generateAllSnapshots() {
        try {
            for (let year = startYear; year <= endYear; year++) {
                const monthStart = (year === startYear) ? startMonth : 0;
                const monthEnd = (year === endYear) ? endMonth : 11;
                
                for (let month = monthStart; month <= monthEnd; month++) {
                    await generateMonthSnapshot(year, month);
                    completed++;
                }
            }
            
            console.log(`成功生成${completed}个月的资产快照`);
            process.exit(0);
        } catch (error) {
            console.error('生成历史快照时发生错误:', error);
            process.exit(1);
        }
    }
    
    generateAllSnapshots();
});