const mysql = require('mysql');

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system',
    charset: 'utf8mb4'
});

connection.connect();

connection.query('SHOW TABLES LIKE "product_accessories"', (err, results) => {
    if (err) {
        console.error('Error checking table:', err);
        process.exit(1);
    }
    
    if (results.length > 0) {
        console.log('Table product_accessories exists');
        
        // Check if columns exist
        connection.query('DESCRIBE product_accessories', (err, columns) => {
            if (err) {
                console.error('Error describing table:', err);
                process.exit(1);
            }
            console.log('Columns:', columns.map(col => col.Field));
            connection.end();
        });
    } else {
        console.log('Table product_accessories does not exist');
        connection.end();
    }
});