const mysql = require('mysql');
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const { exec } = require('child_process');

// 数据库配置
const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system',
    charset: 'utf8mb4'
};

// 备份目录
const backupDir = path.join(__dirname, 'database-backups');
const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss');
const backupFileName = `rental_system_backup_${timestamp}.sql`;
const backupFilePath = path.join(backupDir, backupFileName);

// 确保备份目录存在
if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
}

console.log('开始备份数据库...');
console.log(`备份文件将保存到: ${backupFilePath}`);

// 尝试使用mysqldump
const mysqldumpCommand = `mysqldump -h ${dbConfig.host} -u ${dbConfig.user} -p'${dbConfig.password}' ${dbConfig.database} > "${backupFilePath}"`;

exec(mysqldumpCommand, (error, stdout, stderr) => {
    if (error) {
        console.log('mysqldump命令不可用，使用Node.js方式备份...');
        useNodejsBackup();
        return;
    }
    
    console.log('备份完成！');
    console.log(`备份文件: ${backupFileName}`);
    
    // 检查文件大小
    try {
        const stats = fs.statSync(backupFilePath);
        const fileSize = (stats.size / 1024 / 1024).toFixed(2);
        console.log(`备份文件大小: ${fileSize} MB`);
    } catch (err) {
        console.error('无法获取文件大小:', err);
    }
});

// 使用Node.js进行备份
function useNodejsBackup() {
    const connection = mysql.createConnection(dbConfig);

    connection.connect(err => {
        if (err) {
            console.error('数据库连接失败:', err);
            return;
        }
        console.log('已连接到数据库，开始备份...');

        // 创建备份文件写入流
        const writeStream = fs.createWriteStream(backupFilePath);
        
        // 写入备份文件头
        writeStream.write(`-- 旭租电脑租赁系统数据库备份\n`);
        writeStream.write(`-- 备份时间: ${moment().format('YYYY-MM-DD HH:mm:ss')}\n`);
        writeStream.write(`-- 数据库: ${dbConfig.database}\n\n`);
        writeStream.write(`SET NAMES utf8mb4;\n`);
        writeStream.write(`SET FOREIGN_KEY_CHECKS = 0;\n\n`);

        // 获取所有表名
        connection.query('SHOW TABLES', (err, tables) => {
            if (err) {
                console.error('获取表名失败:', err);
                connection.end();
                return;
            }

            const tableNames = tables.map(table => Object.values(table)[0]);
            console.log(`找到 ${tableNames.length} 个表需要备份`);

            let completedTables = 0;
            
            // 依次备份每个表
            tableNames.forEach(tableName => {
                // 获取表结构
                connection.query(`SHOW CREATE TABLE \`${tableName}\``, (err, result) => {
                    if (err) {
                        console.error(`获取表 ${tableName} 结构失败:`, err);
                        return;
                    }

                    const createTable = result[0]['Create Table'];
                    writeStream.write(`-- 表结构: ${tableName}\n`);
                    writeStream.write(`DROP TABLE IF EXISTS \`${tableName}\`;\n`);
                    writeStream.write(`${createTable};\n\n`);

                    // 获取表数据
                    connection.query(`SELECT * FROM \`${tableName}\``, (err, rows) => {
                        if (err) {
                            console.error(`获取表 ${tableName} 数据失败:`, err);
                            return;
                        }

                        if (rows.length > 0) {
                            writeStream.write(`-- 数据: ${tableName}\n`);
                            writeStream.write(`INSERT INTO \`${tableName}\` VALUES `);

                            rows.forEach((row, index) => {
                                const values = Object.values(row).map(value => {
                                    if (value === null) {
                                        return 'NULL';
                                    } else if (typeof value === 'string') {
                                        return `'${value.replace(/'/g, "\\'")}'`;
                                    } else if (value instanceof Date) {
                                        return `'${moment(value).format('YYYY-MM-DD HH:mm:ss')}'`;
                                    } else {
                                        return value;
                                    }
                                });

                                writeStream.write(`(${values.join(',')})`);
                                if (index < rows.length - 1) {
                                    writeStream.write(`,\n`);
                                } else {
                                    writeStream.write(`;\n\n`);
                                }
                            });
                        }

                        completedTables++;
                        if (completedTables === tableNames.length) {
                            // 所有表备份完成
                            writeStream.write(`SET FOREIGN_KEY_CHECKS = 1;\n`);
                            writeStream.end();
                            
                            console.log(`备份完成！文件保存在: ${backupFilePath}`);
                            console.log(`备份文件名: ${backupFileName}`);
                            
                            // 计算文件大小
                            const stats = fs.statSync(backupFilePath);
                            const fileSize = (stats.size / 1024 / 1024).toFixed(2);
                            console.log(`备份文件大小: ${fileSize} MB`);
                            
                            connection.end();
                        }
                    });
                });
            });
        });
    });
}