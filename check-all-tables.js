const mysql = require('mysql2');
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system'
});

console.log('连接到MySQL数据库...');

// 查询所有包含"snapshot"的表
db.query("SHOW TABLES LIKE '%snapshot%'", (err, results) => {
    if (err) {
        console.error('查询失败:', err);
        process.exit(1);
    }
    
    console.log('\n包含snapshot的表:');
    results.forEach(row => {
        console.log(Object.values(row)[0]); // 获取表名
    });
    
    // 检查每个表的记录数
    const tableNames = results.map(row => Object.values(row)[0]);
    
    let completed = 0;
    
    function checkTableCount(tableName) {
        return new Promise((resolve) => {
            db.query(`SELECT COUNT(*) AS count FROM ${tableName}`, (err, countResult) => {
                if (err) {
                    console.error(`查询${tableName}记录数失败:`, err);
                    resolve({ tableName, count: 0 });
                } else {
                    console.log(`${tableName}: ${countResult[0].count}条记录`);
                    resolve({ tableName, count: countResult[0].count });
                }
            });
        });
    }
    
    Promise.all(tableNames.map(checkTableCount))
        .then(counts => {
            console.log('\n各表记录数统计完成');
            
            // 找到记录数最多的表
            const maxCountTable = counts.reduce((max, current) => 
                current.count > max.count ? current : max, counts[0]);
            
            console.log(`\n记录数最多的表是 ${maxCountTable.tableName}，有${maxCountTable.count}条记录`);
            
            // 如果有多个表，建议使用记录数最多的表
            if (counts.length > 1) {
                console.log('\n建议：使用记录数最多的表作为数据源');
            }
            
            process.exit(0);
        })
        .catch(error => {
            console.error('检查表记录数时出错:', error);
            process.exit(1);
        });
});