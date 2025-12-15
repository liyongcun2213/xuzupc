// 租金管理路由模块
const moment = require('moment');

module.exports = function(app, db, isAuthenticated) {
    
    // ==================== 租金管理主页面 ====================
    app.get('/rent-management', isAuthenticated, (req, res) => {
        // 获取统计数据（使用客户消费管理的 customer_bills 表）
        const statsQuery = `
            SELECT 
                SUM(
                    CASE 
                        WHEN cb.status = 'unpaid' 
                             AND cb.period_start <= CURDATE() 
                             AND rbd.bill_id IS NULL 
                        THEN cb.amount - COALESCE(cb.discount_amount, 0) 
                        ELSE 0 
                    END
                ) as total_receivable,
                SUM(
                    CASE 
                        WHEN cb.status = 'unpaid' 
                             AND cb.period_start < CURDATE() 
                             AND rbd.bill_id IS NULL 
                        THEN cb.amount - COALESCE(cb.discount_amount, 0) 
                        ELSE 0 
                    END
                ) as total_overdue,
                SUM(
                    CASE 
                        WHEN rbd.approval_status = 'approved' 
                        THEN cb.amount - COALESCE(cb.discount_amount, 0) 
                        ELSE 0 
                    END
                ) as total_bad_debt
            FROM customer_bills cb
            LEFT JOIN rent_bad_debt_approvals rbd ON cb.id = rbd.bill_id AND rbd.approval_status = 'approved'
        `;
        
        db.query(statsQuery, (err, statsResults) => {
            if (err) {
                console.error('获取统计数据失败:', err);
                return res.status(500).render('error', { message: '获取统计数据失败' });
            }
            
            const stats = statsResults[0] || {
                total_receivable: 0,
                total_overdue: 0,
                total_bad_debt: 0
            };
            
            res.render('rent-management/index', {
                user: req.session.user,
                active: 'rent-management',
                pageTitle: '租金管理',
                stats: stats
            });
        });
    });
    
    // 获取统计数据 API（用于前端刷新顶部统计卡片）
    app.get('/api/rent-management/stats', isAuthenticated, (req, res) => {
        const statsQuery = `
            SELECT 
                SUM(
                    CASE 
                        WHEN cb.status = 'unpaid' 
                             AND cb.period_start <= CURDATE() 
                             AND rbd.bill_id IS NULL 
                        THEN cb.amount - COALESCE(cb.discount_amount, 0) 
                        ELSE 0 
                    END
                ) as total_receivable,
                SUM(
                    CASE 
                        WHEN cb.status = 'unpaid' 
                             AND cb.period_start < CURDATE() 
                             AND rbd.bill_id IS NULL 
                        THEN cb.amount - COALESCE(cb.discount_amount, 0) 
                        ELSE 0 
                    END
                ) as total_overdue,
                SUM(
                    CASE 
                        WHEN rbd.approval_status = 'approved' 
                        THEN cb.amount - COALESCE(cb.discount_amount, 0) 
                        ELSE 0 
                    END
                ) as total_bad_debt
            FROM customer_bills cb
            LEFT JOIN rent_bad_debt_approvals rbd ON cb.id = rbd.bill_id AND rbd.approval_status = 'approved'
        `;
        
        db.query(statsQuery, (err, statsResults) => {
            if (err) {
                console.error('获取统计数据失败:', err);
                return res.json({ success: false, message: '获取统计数据失败' });
            }
            
            const stats = statsResults[0] || {
                total_receivable: 0,
                total_overdue: 0,
                total_bad_debt: 0
            };
            
            res.json({
                success: true,
                data: stats
            });
        });
    });
    
    // ==================== 1. 应收款 API ====================
    
    // 获取应收账单列表（使用 customer_bills 表）
    app.get('/api/rent-management/receivable', isAuthenticated, (req, res) => {
        const { status, keyword, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;
        
        let whereClause = '1=1';
        const params = [];
        
        // 状态筛选
        if (status) {
            if (status === 'receivable') {
                // 应收：未支付，且账期已开始（排除未到期的未来账单）
                whereClause += ' AND cb.status = ? AND cb.period_start <= CURDATE()';
                params.push('unpaid');
            } else if (status === 'overdue') {
                // 逾期：未支付且预付日已过（period_start < 今天）
                whereClause += ' AND cb.status = ? AND cb.period_start < CURDATE()';
                params.push('unpaid');
            } else if (status === 'paid') {
                whereClause += ' AND cb.status = ?';
                params.push('paid');
            }
        } else {
            // 默认显示应收（未支付且账期已开始）
            whereClause += ' AND cb.status = ? AND cb.period_start <= CURDATE()';
            params.push('unpaid');
        }
        
        // 关键字搜索
        if (keyword) {
            whereClause += ' AND (c.name LIKE ? OR cb.bill_number LIKE ?)';
            params.push(`%${keyword}%`, `%${keyword}%`);
        }
        
        // 获取总数
        const countQuery = `
            SELECT COUNT(*) as total 
            FROM customer_bills cb
            LEFT JOIN customers c ON cb.customer_id = c.id
            LEFT JOIN (
                SELECT DISTINCT bill_id
                FROM rent_bad_debt_approvals
                WHERE approval_status = 'approved'
            ) bad ON bad.bill_id = cb.id
            WHERE ${whereClause} AND bad.bill_id IS NULL
        `;
        
        // 获取列表
        const listQuery = `
            SELECT 
                cb.id,
                cb.bill_number,
                c.name as customer_name,
                c.id as customer_id,
                cb.period_start,
                cb.period_end,
                cb.bill_date,
                cb.amount AS bill_amount,
                COALESCE(r.total_received, 0) AS received_amount,
                GREATEST(
                    cb.amount 
                    - COALESCE(r.total_received, 0) 
                    - COALESCE(cb.discount_amount, 0),
                    0
                ) AS remaining_amount,
                cb.status,
                cb.payment_cycle,
                CASE 
                    WHEN cb.period_start < CURDATE()
                         AND GREATEST(
                             cb.amount 
                             - COALESCE(r.total_received, 0) 
                             - COALESCE(cb.discount_amount, 0),
                             0
                         ) > 0
                    THEN DATEDIFF(CURDATE(), cb.period_start)
                    ELSE 0 
                END AS overdue_days,
                cb.created_at,
                cb.updated_at
            FROM customer_bills cb
            LEFT JOIN customers c ON cb.customer_id = c.id
            LEFT JOIN (
                SELECT bill_id, SUM(received_amount) AS total_received
                FROM rent_received_records
                GROUP BY bill_id
            ) r ON r.bill_id = cb.id
            LEFT JOIN (
                SELECT DISTINCT bill_id
                FROM rent_bad_debt_approvals
                WHERE approval_status = 'approved'
            ) bad ON bad.bill_id = cb.id
            WHERE ${whereClause} AND bad.bill_id IS NULL
            ORDER BY cb.period_end ASC, cb.created_at DESC
            LIMIT ? OFFSET ?
        `;

        
        db.query(countQuery, params, (err, countResult) => {
            if (err) {
                console.error('查询应收账单总数失败:', err);
                return res.json({ success: false, message: '查询失败' });
            }
            
            const total = countResult[0].total;
            
            db.query(listQuery, [...params, parseInt(limit), parseInt(offset)], (err, bills) => {
                if (err) {
                    console.error('查询应收账单列表失败:', err);
                    return res.json({ success: false, message: '查询失败' });
                }
                
                res.json({

                    success: true,
                    data: bills,
                    pagination: {
                        total: total,
                        page: parseInt(page),
                        limit: parseInt(limit),
                        totalPages: Math.ceil(total / limit)
                    }
                });
            });
        });
    });
    
    
    // ==================== 2. 实收款 API ====================
    
    // 查询客户待分配收款余额
    app.get('/api/rent-management/unallocated/:customerId', isAuthenticated, (req, res) => {
        const { customerId } = req.params;

        if (!customerId) {
            return res.json({ success: false, message: '缺少客户ID' });
        }

        const sql = 'SELECT unallocated_amount FROM customer_accounts WHERE customer_id = ? LIMIT 1';
        db.query(sql, [customerId], (err, rows) => {
            if (err) {
                console.error('查询待分配收款余额失败:', err);
                return res.json({ success: false, message: '查询失败' });
            }

            if (!rows || rows.length === 0) {
                return res.json({
                    success: true,
                    data: { unallocated_amount: 0 }
                });
            }

            const unallocatedAmount = parseFloat(rows[0].unallocated_amount || 0);
            res.json({
                success: true,
                data: { unallocated_amount: unallocatedAmount }
            });
        });
    });
    
    // 获取实收记录列表
    app.get('/api/rent-management/received', isAuthenticated, (req, res) => {
        const { keyword, start_date, end_date, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;
        
        let whereClause = '1=1';
        const params = [];
        
        if (keyword) {
            whereClause += ' AND (customer_name LIKE ? OR bill_number LIKE ? OR record_number LIKE ?)';
            params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
        }
        
        if (start_date) {
            whereClause += ' AND received_date >= ?';
            params.push(start_date);
        }
        
        if (end_date) {
            whereClause += ' AND received_date <= ?';
            params.push(end_date);
        }
        
        const countQuery = `SELECT COUNT(*) as total FROM rent_received_records WHERE ${whereClause}`;
        const listQuery = `
            SELECT *
            FROM rent_received_records
            WHERE ${whereClause}
            ORDER BY received_date DESC, created_at DESC
            LIMIT ? OFFSET ?
        `;
        
        db.query(countQuery, params, (err, countResult) => {
            if (err) {
                console.error('查询实收记录总数失败:', err);
                return res.json({ success: false, message: '查询失败' });
            }
            
            const total = countResult[0].total;
            
            db.query(listQuery, [...params, parseInt(limit), parseInt(offset)], (err, records) => {
                if (err) {
                    console.error('查询实收记录列表失败:', err);
                    return res.json({ success: false, message: '查询失败' });
                }
                
                res.json({
                    success: true,
                    data: records,
                    pagination: {
                        total: total,
                        page: parseInt(page),
                        limit: parseInt(limit),
                        totalPages: Math.ceil(total / limit)
                    }
                });
            });
        });
    });
    
    // 确认收款（核销）- 标记 customer_bills 为已支付
    app.post('/api/rent-management/receive', isAuthenticated, (req, res) => {
        const {
            bill_id,
            received_amount,
            discount_amount,
            received_date,
            payment_method,
            transaction_no,
            bank_account,
            finance_account_code,
            notes,
            use_unallocated
        } = req.body;

        if (!bill_id || !received_date || !payment_method) {
            return res.json({ success: false, message: '缺少必填参数' });
        }

        const receiveAmount = received_amount ? parseFloat(received_amount) : 0;
        const discountAmount = discount_amount ? parseFloat(discount_amount) : 0;

        if (Number.isNaN(receiveAmount) || receiveAmount < 0) {
            return res.json({ success: false, message: '收款金额不能为负数' });
        }

        if (Number.isNaN(discountAmount) || discountAmount < 0) {
            return res.json({ success: false, message: '打折金额不能为负数' });
        }

        if (receiveAmount <= 0 && discountAmount <= 0) {
            return res.json({ success: false, message: '收款金额和打折金额不能同时为0' });
        }


        db.beginTransaction((transactionErr) => {
            if (transactionErr) {
                console.error('开启事务失败:', transactionErr);
                return res.json({ success: false, message: '操作失败' });
            }

            const billQuery = `
                SELECT cb.*, c.name as customer_name 
                FROM customer_bills cb
                LEFT JOIN customers c ON cb.customer_id = c.id
                WHERE cb.id = ?
            `;

            db.query(billQuery, [bill_id], (billErr, bills) => {
                if (billErr || !bills || bills.length === 0) {
                    return db.rollback(() => {
                        console.error('查询账单失败:', billErr);
                        res.json({ success: false, message: '账单不存在' });
                    });
                }

                const bill = bills[0];
                const billAmount = parseFloat(bill.amount || 0);

                const totalReceivedSql = `
                    SELECT COALESCE(SUM(received_amount), 0) AS total_received
                    FROM rent_received_records
                    WHERE bill_id = ?
                `;

                db.query(totalReceivedSql, [bill_id], (sumErr, sumRows) => {
                    if (sumErr) {
                        return db.rollback(() => {
                            console.error('查询已收金额失败:', sumErr);
                            res.json({ success: false, message: '查询已收金额失败' });
                        });
                    }

                    const alreadyReceived = parseFloat((sumRows[0] && sumRows[0].total_received) || 0);
                    const existingDiscount = parseFloat(bill.discount_amount || 0);
                    const remaining = billAmount - alreadyReceived - existingDiscount;

                    if (remaining <= 0.01) {
                        return db.rollback(() => {
                            res.json({ success: false, message: '该账单已全部结清，无需重复操作' });
                        });
                    }

                    const receivePlusDiscount = receiveAmount + discountAmount;

                    if (receivePlusDiscount > remaining + 0.01) {
                        return db.rollback(() => {
                            res.json({ success: false, message: '收款金额与打折金额之和不能超过剩余应收金额' });
                        });
                    }

                    const newTotalReceived = alreadyReceived + receiveAmount;
                    const newTotalDiscount = existingDiscount + discountAmount;
                    const settledAmount = newTotalReceived + newTotalDiscount;
                    const newStatus = settledAmount >= billAmount - 0.01 ? 'paid' : 'unpaid';

                    const finalizeReceive = () => {
                        const updateBillQuery = `
                            UPDATE customer_bills
                            SET status = ?, discount_amount = ?, updated_at = NOW()
                            WHERE id = ?
                        `;

                        db.query(updateBillQuery, [newStatus, newTotalDiscount, bill_id], (updateErr) => {
                            if (updateErr) {
                                return db.rollback(() => {
                                    console.error('更新账单失败:', updateErr);
                                    res.json({ success: false, message: '更新账单失败' });
                                });
                            }

                            const recordNumber = `REC-${moment().format('YYYYMMDDHHmmss')}-${Math.floor(Math.random() * 1000)}`;

                            const insertRecordQuery = `
                                INSERT INTO rent_received_records
                                (record_number, bill_id, bill_number, customer_id, customer_name,
                                 received_amount, received_date, payment_method, transaction_no,
                                 bank_account, notes, operator_id, operator_name)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            `;

                            db.query(
                                insertRecordQuery,
                                [
                                    recordNumber,
                                    bill_id,
                                    bill.bill_number,
                                    bill.customer_id,
                                    bill.customer_name,
                                    receiveAmount,
                                    received_date,
                                    payment_method,
                                    transaction_no,
                                    bank_account,
                                    notes,
                                    req.session.user.id,
                                    req.session.user.real_name
                                ],
                                (insertErr) => {
                                    if (insertErr) {
                                        return db.rollback(() => {
                                            console.error('插入收款记录失败:', insertErr);
                                            res.json({ success: false, message: '插入收款记录失败' });
                                        });
                                    }

                                    const accountCode = finance_account_code === 'private' ? 'private' : 'public';
                                    const findAccountSql = 'SELECT id FROM finance_accounts WHERE code = ? LIMIT 1';

                                    db.query(findAccountSql, [accountCode], (accErr, accResults) => {
                                        if (accErr) {
                                            return db.rollback(() => {
                                                console.error('查询财务账户失败:', accErr);
                                                res.json({ success: false, message: '查询财务账户失败' });
                                            });
                                        }

                                        const accountId = accResults && accResults[0] ? accResults[0].id : null;

                                        const insertFinancialRecordSql = `
                                            INSERT INTO financial_records (
                                                record_type,
                                                category,
                                                amount,
                                                description,
                                                reference_id,
                                                reference_type,
                                                transaction_date,
                                                account_id,
                                                created_by
                                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                                        `;

                                        const descriptionBase = `客户 ${bill.customer_name}，账单 ${bill.bill_number} 收款，收款方式：${payment_method}`;
                                        const description = discountAmount > 0
                                            ? `${descriptionBase}，打折金额：${discountAmount.toFixed(2)}`
                                            : descriptionBase;

                                        db.query(
                                            insertFinancialRecordSql,
                                            [
                                                'income',
                                                '电脑租金收入',
                                                receiveAmount,
                                                description,
                                                bill_id,
                                                'rent_bill',
                                                received_date,
                                                accountId,
                                                req.session.user.id
                                            ],
                                            (frErr) => {
                                                if (frErr) {
                                                    return db.rollback(() => {
                                                        console.error('写入财务记录失败:', frErr);
                                                        res.json({ success: false, message: '写入财务记录失败' });
                                                    });
                                                }

                                                db.commit((commitErr) => {
                                                    if (commitErr) {
                                                        return db.rollback(() => {
                                                            console.error('提交事务失败:', commitErr);
                                                            res.json({ success: false, message: '操作失败' });
                                                        });
                                                    }

                                                    res.json({
                                                        success: true,
                                                        message: '收款确认成功',
                                                        record_number: recordNumber,
                                                        new_status: newStatus
                                                    });
                                                });
                                            }
                                        );
                                    });
                                }
                            );
                        });
                    };

                    if (use_unallocated) {
                        const customerId = bill.customer_id;
                        const findCustomerAccountSql = 'SELECT prepaid_amount, consumed_amount, unallocated_amount FROM customer_accounts WHERE customer_id = ? LIMIT 1';
                        db.query(findCustomerAccountSql, [customerId], (accountErr, accountRows) => {
                            if (accountErr) {
                                return db.rollback(() => {
                                    console.error('查询客户账户失败:', accountErr);
                                    res.json({ success: false, message: '查询客户账户失败' });
                                });
                            }

                            if (!accountRows || accountRows.length === 0) {
                                return db.rollback(() => {
                                    res.json({ success: false, message: '客户账户不存在，无法使用待分配收款余额' });
                                });
                            }

                            const currentPrepaid = parseFloat(accountRows[0].prepaid_amount || 0);
                            const currentConsumed = parseFloat(accountRows[0].consumed_amount || 0);
                            const currentUnallocated = parseFloat(accountRows[0].unallocated_amount || 0);

                            if (currentUnallocated + 0.01 < receiveAmount) {
                                return db.rollback(() => {
                                    res.json({ success: false, message: '待分配收款余额不足，无法完成本次收款核销' });
                                });
                            }

                            const newUnallocated = currentUnallocated - receiveAmount;
                            const totalIncreasePrepaid = receiveAmount + discountAmount;
                            const newPrepaid = currentPrepaid + totalIncreasePrepaid;
                            const newBalance = newPrepaid - currentConsumed;
                            const newAccountStatus = newBalance < 0 ? 'overdue' : 'paid';


                            const updateAccountSql = `
                                UPDATE customer_accounts
                                SET unallocated_amount = ?,
                                    prepaid_amount = ?,
                                    balance = ?,
                                    status = ?,
                                    updated_at = CURRENT_TIMESTAMP
                                WHERE customer_id = ?
                            `;

                            db.query(updateAccountSql, [newUnallocated, newPrepaid, newBalance, newAccountStatus, customerId], (updateAccountErr) => {
                                if (updateAccountErr) {
                                    return db.rollback(() => {
                                        console.error('更新客户账户未分配收款余额失败:', updateAccountErr);
                                        res.json({ success: false, message: '更新客户账户未分配收款余额失败' });
                                    });
                                }

                                finalizeReceive();
                            });
                        });
                    } else {
                        finalizeReceive();
                    }
                });
            });
        });
    });
    
    /*
    // 确认收款（核销）- 标记 customer_bills 为已支付
    app.post('/api/rent-management/receive', isAuthenticated, (req, res) => {
        const {
            bill_id,
            received_amount,
            discount_amount,
            received_date,
            payment_method,
            transaction_no,
            bank_account,
            finance_account_code,
            notes,
            use_unallocated
        } = req.body;

        if (!bill_id || !received_date || !payment_method) {
            return res.json({ success: false, message: '缺少必填参数' });
        }

        const receiveAmount = received_amount ? parseFloat(received_amount) : 0;
        const discountAmount = discount_amount ? parseFloat(discount_amount) : 0;

        if (Number.isNaN(receiveAmount) || receiveAmount < 0) {
            return res.json({ success: false, message: '收款金额不能为负数' });
        }

        if (Number.isNaN(discountAmount) || discountAmount < 0) {
            return res.json({ success: false, message: '打折金额不能为负数' });
        }

        if (receiveAmount <= 0 && discountAmount <= 0) {
            return res.json({ success: false, message: '收款金额和打折金额不能同时为0' });
        }


        // 开始事务
        db.beginTransaction((transactionErr) => {
            if (transactionErr) {
                console.error('开启事务失败:', transactionErr);
                return res.json({ success: false, message: '操作失败' });
            }

            // 1. 查询账单信息（从 customer_bills 表）
            const billQuery = `
                SELECT cb.*, c.name as customer_name 
                FROM customer_bills cb
                LEFT JOIN customers c ON cb.customer_id = c.id
                WHERE cb.id = ?
            `;

            db.query(billQuery, [bill_id], (billErr, bills) => {
                if (billErr || bills.length === 0) {
                    return db.rollback(() => {
                        res.json({ success: false, message: '账单不存在' });
                    });
                }

                const bill = bills[0];
                const billAmount = parseFloat(bill.amount || 0);

                // 2. 查询历史已收金额，按“剩余应收”校验本次收款
                const totalReceivedSql = `
                    SELECT COALESCE(SUM(received_amount), 0) AS total_received
                    FROM rent_received_records
                    WHERE bill_id = ?
                `;

                db.query(totalReceivedSql, [bill_id], (sumErr, sumRows) => {
                    if (sumErr) {
                        return db.rollback(() => {
                            console.error('查询已收金额失败:', sumErr);
                            res.json({ success: false, message: '查询已收金额失败' });
                        });
                    }

                    const alreadyReceived = parseFloat((sumRows[0] && sumRows[0].total_received) || 0);
                    const existingDiscount = parseFloat(bill.discount_amount || 0);
                    const remaining = billAmount - alreadyReceived - existingDiscount;

                    if (remaining <= 0.01) {
                        return db.rollback(() => {
                            res.json({ success: false, message: '该账单已全部结清，无需重复操作' });
                        });
                    }

                    const receivePlusDiscount = receiveAmount + discountAmount;

                    if (receivePlusDiscount > remaining + 0.01) {
                        return db.rollback(() => {
                            res.json({ success: false, message: '收款金额与打折金额之和不能超过剩余应收金额' });
                        });
                    }

                    const newTotalReceived = alreadyReceived + receiveAmount;
                    const newTotalDiscount = existingDiscount + discountAmount;
                    const settledAmount = newTotalReceived + newTotalDiscount;
                    const newStatus = settledAmount >= billAmount - 0.01 ? 'paid' : 'unpaid';

                    const finalizeReceive = () => {
                        // 3. 更新账单状态（是否全部收清）
                        const updateBillQuery = `
                            UPDATE customer_bills
                            SET status = ?, discount_amount = ?, updated_at = NOW()
                            WHERE id = ?
                        `;

                        db.query(updateBillQuery, [newStatus, newTotalDiscount, bill_id], (updateErr) => {
                            if (updateErr) {
                                return db.rollback(() => {
                                    console.error('更新账单失败:', updateErr);
                                    res.json({ success: false, message: '更新账单失败' });
                                });
                            }

                            // 4. 生成收款记录编号
                            const recordNumber = `REC-${moment().format('YYYYMMDDHHmmss')}-${Math.floor(Math.random() * 1000)}`;

                            // 5. 插入实收记录
                            const insertRecordQuery = `
                                INSERT INTO rent_received_records
                                (record_number, bill_id, bill_number, customer_id, customer_name,
                                 received_amount, received_date, payment_method, transaction_no,
                                 bank_account, notes, operator_id, operator_name)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            `;

                            db.query(
                                insertRecordQuery,
                                [
                                    recordNumber,
                                    bill_id,
                                    bill.bill_number,
                                    bill.customer_id,
                                    bill.customer_name,
                                    receiveAmount,
                                    received_date,
                                    payment_method,
                                    transaction_no,
                                    bank_account,
                                    notes,
                                    req.session.user.id,
                                    req.session.user.real_name
                                ],
                                (insertErr) => {
                                    if (insertErr) {
                                        return db.rollback(() => {
                                            console.error('插入收款记录失败:', insertErr);
                                            res.json({ success: false, message: '插入收款记录失败' });
                                        });
                                    }

                                    // 6. 将本次实收租金记入财务流水账
                                    const accountCode = finance_account_code === 'private' ? 'private' : 'public';
                                    const findAccountSql = 'SELECT id FROM finance_accounts WHERE code = ? LIMIT 1';

                                    db.query(findAccountSql, [accountCode], (accErr, accResults) => {
                                        if (accErr) {
                                            return db.rollback(() => {
                                                console.error('查询财务账户失败:', accErr);
                                                res.json({ success: false, message: '查询财务账户失败' });
                                            });
                                        }

                                        const accountId = accResults && accResults[0] ? accResults[0].id : null;

                                        const insertFinancialRecordSql = `
                                            INSERT INTO financial_records (
                                                record_type,
                                                category,
                                                amount,
                                                description,
                                                reference_id,
                                                reference_type,
                                                transaction_date,
                                                account_id,
                                                created_by
                                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                                        `;

                                        const descriptionBase = `客户 ${bill.customer_name}，账单 ${bill.bill_number} 收款，收款方式：${payment_method}`;
                                        const description = discountAmount > 0
                                            ? `${descriptionBase}，打折金额：${discountAmount.toFixed(2)}`
                                            : descriptionBase;

                                        db.query(
                                            insertFinancialRecordSql,
                                            [
                                                'income',
                                                '电脑租金收入',
                                                receiveAmount,
                                                description,
                                                bill_id,
                                                'rent_bill',
                                                received_date,
                                                accountId,
                                                req.session.user.id
                                            ],
                                            (frErr) => {
                                                if (frErr) {
                                                    return db.rollback(() => {
                                                        console.error('写入财务记录失败:', frErr);
                                                        res.json({ success: false, message: '写入财务记录失败' });
                                                    });
                                                }

                                                // 提交事务
                                                db.commit((commitErr) => {
                                                    if (commitErr) {
                                                        return db.rollback(() => {
                                                            console.error('提交事务失败:', commitErr);
                                                            res.json({ success: false, message: '操作失败' });
                                                        });
                                                    }

                                                    res.json({
                                                        success: true,
                                                        message: '收款确认成功',
                                                        record_number: recordNumber,
                                                        new_status: newStatus
                                                    });
                                                });
                                            }
                                        );
                                    });
                                }
                            );
                        });
                    };

                    // 如果选择了使用客户消费管理中的待分配收款余额，则先扣减未分配余额
                    if (use_unallocated) {
                        const customerId = bill.customer_id;
                        const findCustomerAccountSql = 'SELECT unallocated_amount FROM customer_accounts WHERE customer_id = ? LIMIT 1';
                        db.query(findCustomerAccountSql, [customerId], (accountErr, accountRows) => {
                            if (accountErr) {
                                return db.rollback(() => {
                                    console.error('查询客户账户失败:', accountErr);
                                    res.json({ success: false, message: '查询客户账户失败' });
                                });
                            }

                            if (!accountRows || accountRows.length === 0) {
                                return db.rollback(() => {
                                    res.json({ success: false, message: '客户账户不存在，无法使用待分配收款余额' });
                                });
                            }

                            const currentUnallocated = parseFloat(accountRows[0].unallocated_amount || 0);
                            if (currentUnallocated + 0.01 < receiveAmount) {
                                return db.rollback(() => {
                                    res.json({ success: false, message: '待分配收款余额不足，无法完成本次收款核销' });
                                });
                            }

                            const newUnallocated = currentUnallocated - receiveAmount;
                            const updateAccountSql = `
                                UPDATE customer_accounts
                                SET unallocated_amount = ?, updated_at = CURRENT_TIMESTAMP
                                WHERE customer_id = ?
                            `;

                            db.query(updateAccountSql, [newUnallocated, customerId], (updateAccountErr) => {
                                if (updateAccountErr) {
                                    return db.rollback(() => {
                                        console.error('更新客户账户未分配收款余额失败:', updateAccountErr);
                                        res.json({ success: false, message: '更新客户账户未分配收款余额失败' });
                                    });
                                }

                                // 扣减未分配收款余额成功后，继续完成收款流程
                                finalizeReceive();
                            });
                        });
                    } else {
                        // 不使用待分配收款余额，直接完成收款流程
                        finalizeReceive();
                    }
                }
            );


            });
        });
    });


    
    // 获取单个账单详情
    app.get('/api/rent-management/bill/:id', isAuthenticated, (req, res) => {
        const billId = req.params.id;
        
        const query = `
            SELECT 
                cb.*,
                c.name AS customer_name,
                COALESCE(r.total_received, 0) AS total_received
            FROM customer_bills cb
            LEFT JOIN customers c ON cb.customer_id = c.id
            LEFT JOIN (
                SELECT bill_id, SUM(received_amount) AS total_received
                FROM rent_received_records
                GROUP BY bill_id
            ) r ON r.bill_id = cb.id
            WHERE cb.id = ?
            LIMIT 1
        `;
        
        db.query(query, [billId], (err, results) => {
            if (err) {
                console.error('查询账单详情失败:', err);
                return res.json({ success: false, message: '查询账单详情失败' });
            }

            if (!results || results.length === 0) {
                return res.json({ success: false, message: '账单不存在' });
            }
            
            const bill = results[0];

            // 适配前端字段
            bill.bill_period_start = bill.period_start;
            bill.bill_period_end = bill.period_end;
            bill.bill_amount = bill.amount;

            const billAmountNumber = parseFloat(bill.amount || 0);
            const totalReceived = parseFloat(bill.total_received || 0);
            const discountAmount = parseFloat(bill.discount_amount || 0);
            const receivedAmount = parseFloat(totalReceived.toFixed(2));
            const remainingRaw = billAmountNumber - discountAmount - receivedAmount;
            const remainingAmount = remainingRaw > 0 ? remainingRaw : 0;

            bill.received_amount = receivedAmount;
            bill.remaining_amount = parseFloat(remainingAmount.toFixed(2));
            bill.discount_amount = parseFloat(discountAmount.toFixed(2));
            
            res.json({ success: true, data: bill });

        });
    });
    
    // 获取实收记录列表
    app.get('/api/rent-management/received', isAuthenticated, (req, res) => {
        const { keyword, start_date, end_date, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;
        
        let whereClause = '1=1';
        const params = [];
        
        if (keyword) {
            whereClause += ' AND (customer_name LIKE ? OR bill_number LIKE ? OR record_number LIKE ?)';
            params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
        }
        
        if (start_date) {
            whereClause += ' AND received_date >= ?';
            params.push(start_date);
        }
        
        if (end_date) {
            whereClause += ' AND received_date <= ?';
            params.push(end_date);
        }
        
        const countQuery = `SELECT COUNT(*) as total FROM rent_received_records WHERE ${whereClause}`;
        const listQuery = `
            SELECT *
            FROM rent_received_records
            WHERE ${whereClause}
            ORDER BY received_date DESC, created_at DESC
            LIMIT ? OFFSET ?
        `;
        
        db.query(countQuery, params, (err, countResult) => {
            if (err) {
                console.error('查询实收记录总数失败:', err);
                return res.json({ success: false, message: '查询失败' });
            }
            
            const total = countResult[0].total;
            
            db.query(listQuery, [...params, parseInt(limit), parseInt(offset)], (err, records) => {
                if (err) {
                    console.error('查询实收记录列表失败:', err);
                    return res.json({ success: false, message: '查询失败' });
                }
                
                res.json({
                    success: true,
                    data: records,
                    pagination: {
                        total: total,
                        page: parseInt(page),
                        limit: parseInt(limit),
                        totalPages: Math.ceil(total / limit)
                    }
                });
            });
        });
    });
    
    // 确认收款（核销）- 标记 customer_bills 为已支付
    app.post('/api/rent-management/receive', isAuthenticated, (req, res) => {
        const {
            bill_id,
            received_amount,
            discount_amount,
            received_date,
            payment_method,
            transaction_no,
            bank_account,
            finance_account_code,
            notes,
            use_unallocated
        } = req.body;

        if (!bill_id || !received_date || !payment_method) {
            return res.json({ success: false, message: '缺少必填参数' });
        }

        const receiveAmount = received_amount ? parseFloat(received_amount) : 0;
        const discountAmount = discount_amount ? parseFloat(discount_amount) : 0;

        if (Number.isNaN(receiveAmount) || receiveAmount < 0) {
            return res.json({ success: false, message: '收款金额不能为负数' });
        }

        if (Number.isNaN(discountAmount) || discountAmount < 0) {
            return res.json({ success: false, message: '打折金额不能为负数' });
        }

        if (receiveAmount <= 0 && discountAmount <= 0) {
            return res.json({ success: false, message: '收款金额和打折金额不能同时为0' });
        }


        db.beginTransaction((transactionErr) => {
            if (transactionErr) {
                console.error('开启事务失败:', transactionErr);
                return res.json({ success: false, message: '操作失败' });
            }

            const billQuery = `
                SELECT cb.*, c.name as customer_name 
                FROM customer_bills cb
                LEFT JOIN customers c ON cb.customer_id = c.id
                WHERE cb.id = ?
            `;

            db.query(billQuery, [bill_id], (billErr, bills) => {
                if (billErr || !bills || bills.length === 0) {
                    return db.rollback(() => {
                        console.error('查询账单失败:', billErr);
                        res.json({ success: false, message: '账单不存在' });
                    });
                }

                const bill = bills[0];
                const billAmount = parseFloat(bill.amount || 0);

                const totalReceivedSql = `
                    SELECT COALESCE(SUM(received_amount), 0) AS total_received
                    FROM rent_received_records
                    WHERE bill_id = ?
                `;

                db.query(totalReceivedSql, [bill_id], (sumErr, sumRows) => {
                    if (sumErr) {
                        return db.rollback(() => {
                            console.error('查询已收金额失败:', sumErr);
                            res.json({ success: false, message: '查询已收金额失败' });
                        });
                    }

                    const alreadyReceived = parseFloat((sumRows[0] && sumRows[0].total_received) || 0);
                    const existingDiscount = parseFloat(bill.discount_amount || 0);
                    const remaining = billAmount - alreadyReceived - existingDiscount;

                    if (remaining <= 0.01) {
                        return db.rollback(() => {
                            res.json({ success: false, message: '该账单已全部结清，无需重复操作' });
                        });
                    }

                    const receivePlusDiscount = receiveAmount + discountAmount;

                    if (receivePlusDiscount > remaining + 0.01) {
                        return db.rollback(() => {
                            res.json({ success: false, message: '收款金额与打折金额之和不能超过剩余应收金额' });
                        });
                    }

                    const newTotalReceived = alreadyReceived + receiveAmount;
                    const newTotalDiscount = existingDiscount + discountAmount;
                    const settledAmount = newTotalReceived + newTotalDiscount;
                    const newStatus = settledAmount >= billAmount - 0.01 ? 'paid' : 'unpaid';

                    const finalizeReceive = () => {
                        const updateBillQuery = `
                            UPDATE customer_bills
                            SET status = ?, discount_amount = ?, updated_at = NOW()
                            WHERE id = ?
                        `;

                        db.query(updateBillQuery, [newStatus, newTotalDiscount, bill_id], (updateErr) => {
                            if (updateErr) {
                                return db.rollback(() => {
                                    console.error('更新账单失败:', updateErr);
                                    res.json({ success: false, message: '更新账单失败' });
                                });
                            }

                            const recordNumber = `REC-${moment().format('YYYYMMDDHHmmss')}-${Math.floor(Math.random() * 1000)}`;

                            const insertRecordQuery = `
                                INSERT INTO rent_received_records
                                (record_number, bill_id, bill_number, customer_id, customer_name,
                                 received_amount, received_date, payment_method, transaction_no,
                                 bank_account, notes, operator_id, operator_name)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            `;

                            db.query(
                                insertRecordQuery,
                                [
                                    recordNumber,
                                    bill_id,
                                    bill.bill_number,
                                    bill.customer_id,
                                    bill.customer_name,
                                    receiveAmount,
                                    received_date,
                                    payment_method,
                                    transaction_no,
                                    bank_account,
                                    notes,
                                    req.session.user.id,
                                    req.session.user.real_name
                                ],
                                (insertErr) => {
                                    if (insertErr) {
                                        return db.rollback(() => {
                                            console.error('插入收款记录失败:', insertErr);
                                            res.json({ success: false, message: '插入收款记录失败' });
                                        });
                                    }

                                    const accountCode = finance_account_code === 'private' ? 'private' : 'public';
                                    const findAccountSql = 'SELECT id FROM finance_accounts WHERE code = ? LIMIT 1';

                                    db.query(findAccountSql, [accountCode], (accErr, accResults) => {
                                        if (accErr) {
                                            return db.rollback(() => {
                                                console.error('查询财务账户失败:', accErr);
                                                res.json({ success: false, message: '查询财务账户失败' });
                                            });
                                        }

                                        const accountId = accResults && accResults[0] ? accResults[0].id : null;

                                        const insertFinancialRecordSql = `
                                            INSERT INTO financial_records (
                                                record_type,
                                                category,
                                                amount,
                                                description,
                                                reference_id,
                                                reference_type,
                                                transaction_date,
                                                account_id,
                                                created_by
                                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                                        `;

                                        const descriptionBase = `客户 ${bill.customer_name}，账单 ${bill.bill_number} 收款，收款方式：${payment_method}`;
                                        const description = discountAmount > 0
                                            ? `${descriptionBase}，打折金额：${discountAmount.toFixed(2)}`
                                            : descriptionBase;

                                        db.query(
                                            insertFinancialRecordSql,
                                            [
                                                'income',
                                                '电脑租金收入',
                                                receiveAmount,
                                                description,
                                                bill_id,
                                                'rent_bill',
                                                received_date,
                                                accountId,
                                                req.session.user.id
                                            ],
                                            (frErr) => {
                                                if (frErr) {
                                                    return db.rollback(() => {
                                                        console.error('写入财务记录失败:', frErr);
                                                        res.json({ success: false, message: '写入财务记录失败' });
                                                    });
                                                }

                                                db.commit((commitErr) => {
                                                    if (commitErr) {
                                                        return db.rollback(() => {
                                                            console.error('提交事务失败:', commitErr);
                                                            res.json({ success: false, message: '操作失败' });
                                                        });
                                                    }

                                                    res.json({
                                                        success: true,
                                                        message: '收款确认成功',
                                                        record_number: recordNumber,
                                                        new_status: newStatus
                                                    });
                                                });
                                            }
                                        );
                                    });
                                }
                            );
                        });
                    };

                    if (use_unallocated) {
                        const customerId = bill.customer_id;
                        const findCustomerAccountSql = 'SELECT prepaid_amount, consumed_amount, unallocated_amount FROM customer_accounts WHERE customer_id = ? LIMIT 1';
                        db.query(findCustomerAccountSql, [customerId], (accountErr, accountRows) => {
                            if (accountErr) {
                                return db.rollback(() => {
                                    console.error('查询客户账户失败:', accountErr);
                                    res.json({ success: false, message: '查询客户账户失败' });
                                });
                            }

                            if (!accountRows || accountRows.length === 0) {
                                return db.rollback(() => {
                                    res.json({ success: false, message: '客户账户不存在，无法使用待分配收款余额' });
                                });
                            }

                            const currentPrepaid = parseFloat(accountRows[0].prepaid_amount || 0);
                            const currentConsumed = parseFloat(accountRows[0].consumed_amount || 0);
                            const currentUnallocated = parseFloat(accountRows[0].unallocated_amount || 0);

                            if (currentUnallocated + 0.01 < receiveAmount) {
                                return db.rollback(() => {
                                    res.json({ success: false, message: '待分配收款余额不足，无法完成本次收款核销' });
                                });
                            }

                            const newUnallocated = currentUnallocated - receiveAmount;
                            const totalIncreasePrepaid = receiveAmount + discountAmount;
                            const newPrepaid = currentPrepaid + totalIncreasePrepaid;
                            const newBalance = newPrepaid - currentConsumed;
                            const newAccountStatus = newBalance < 0 ? 'overdue' : 'paid';


                            const updateAccountSql = `
                                UPDATE customer_accounts
                                SET unallocated_amount = ?,
                                    prepaid_amount = ?,
                                    balance = ?,
                                    status = ?,
                                    updated_at = CURRENT_TIMESTAMP
                                WHERE customer_id = ?
                            `;

                            db.query(updateAccountSql, [newUnallocated, newPrepaid, newBalance, newAccountStatus, customerId], (updateAccountErr) => {
                                if (updateAccountErr) {
                                    return db.rollback(() => {
                                        console.error('更新客户账户未分配收款余额失败:', updateAccountErr);
                                        res.json({ success: false, message: '更新客户账户未分配收款余额失败' });
                                    });
                                }

                                finalizeReceive();
                            });
                        });
                    } else {
                        finalizeReceive();
                    }
                });
            });
        });
    });
    
    /*
    // 确认收款（核销）
    app.post('/api/rent-management/receive', isAuthenticated, (req, res) => {
        const {
            bill_id,
            received_amount,
            received_date,
            payment_method,
            transaction_no,
            bank_account,
            finance_account_code,
            notes,
            use_unallocated
        } = req.body;
        
        if (!bill_id || !received_amount || !received_date || !payment_method) {
            return res.json({ success: false, message: '缺少必填参数' });
        }
        
        const receiveAmount = parseFloat(received_amount);
        if (receiveAmount <= 0) {
            return res.json({ success: false, message: '收款金额必须大于0' });
        }
        
        // 开始事务
        db.beginTransaction(err => {
            if (err) {
                console.error('开启事务失败:', err);
                return res.json({ success: false, message: '操作失败' });
            }
            
            // 1. 查询账单信息
            const billQuery = 'SELECT * FROM rent_receivable_bills WHERE id = ?';
            db.query(billQuery, [bill_id], (err, bills) => {
                if (err || bills.length === 0) {
                    return db.rollback(() => {
                        res.json({ success: false, message: '账单不存在' });
                    });
                }
                
                const bill = bills[0];
                const newReceivedAmount = parseFloat(bill.received_amount) + receiveAmount;
                const newRemainingAmount = parseFloat(bill.bill_amount) - newReceivedAmount;
                
                // 检查收款金额是否超过未收金额
                if (receiveAmount > parseFloat(bill.remaining_amount)) {
                    return db.rollback(() => {
                        res.json({ success: false, message: '收款金额超过未收金额' });
                    });
                }
                
                // 2. 更新账单状态
                let newStatus = 'paid';
                if (newRemainingAmount > 0.01) {
                    newStatus = 'partial';
                }
                
                const updateBillQuery = `
                    UPDATE rent_receivable_bills
                    SET received_amount = ?, remaining_amount = ?, status = ?, updated_at = NOW()
                    WHERE id = ?
                `;
                
                db.query(updateBillQuery, [newReceivedAmount, newRemainingAmount, newStatus, bill_id], (err) => {
                    if (err) {
                        return db.rollback(() => {
                            console.error('更新账单失败:', err);
                            res.json({ success: false, message: '更新账单失败' });
                        });
                    }
                    
                    // 3. 生成收款记录编号
                    const recordNumber = `REC-${moment().format('YYYYMMDDHHmmss')}-${Math.floor(Math.random() * 1000)}`;
                    
                    // 4. 插入实收记录
                    const insertRecordQuery = `
                        INSERT INTO rent_received_records
                        (record_number, bill_id, bill_number, customer_id, customer_name,
                         received_amount, received_date, payment_method, transaction_no,
                         bank_account, notes, operator_id, operator_name)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `;
                    
                    db.query(insertRecordQuery, [
                        recordNumber, bill_id, bill.bill_number, bill.customer_id, bill.customer_name,
                        receiveAmount, received_date, payment_method, transaction_no,
                        bank_account, notes, req.session.user.id, req.session.user.real_name
                    ], (err) => {
                        if (err) {
                            return db.rollback(() => {
                                console.error('插入收款记录失败:', err);
                                res.json({ success: false, message: '插入收款记录失败' });
                            });
                        }
                        
                        // 5. 更新客户账户最近付款日
                        const updateCustomerQuery = `
                            UPDATE customers
                            SET updated_at = NOW()
                            WHERE id = ?
                        `;
                        
                        db.query(updateCustomerQuery, [bill.customer_id], (err) => {
                            if (err) {
                                console.error('更新客户信息失败:', err);
                                // 不阻断流程
                            }
                            
                            // 提交事务
                            db.commit(err => {
                                if (err) {
                                    return db.rollback(() => {
                                        console.error('提交事务失败:', err);
                                        res.json({ success: false, message: '操作失败' });
                                    });
                                }
                                
                                res.json({ 
                                    success: true, 
                                    message: '收款确认成功',
                                    record_number: recordNumber,
                                    new_status: newStatus
                                });
                            });
                        });


            });
        });
    });
    
    // 获取单个账单详情
    app.get('/api/rent-management/bill/:id', isAuthenticated, (req, res) => {
        const billId = req.params.id;
        
        const query = `
            SELECT 
                b.*,
                (SELECT JSON_ARRAYAGG(
                    JSON_OBJECT(
                        'id', r.id,
                        'record_number', r.record_number,
                        'received_amount', r.received_amount,
                        'received_date', r.received_date,
                        'payment_method', r.payment_method,
                        'operator_name', r.operator_name,
                        'created_at', r.created_at
                    )
                ) FROM rent_received_records r WHERE r.bill_id = b.id) as payment_records
            FROM rent_receivable_bills b
            WHERE b.id = ?
        `;
        
        db.query(query, [billId], (err, results) => {
            if (err) {
                console.error('查询账单详情失败:', err);
                return res.json({ success: false, message: '查询账单详情失败' });
            }

            if (!results || results.length === 0) {
                return res.json({ success: false, message: '账单不存在' });
            }
            
            const bill = results[0];
            if (bill.payment_records) {
                bill.payment_records = JSON.parse(bill.payment_records);
            }
            
            res.json({ success: true, data: bill });
        });

    });
    */
    
    // ==================== 3. 逾期款 API ====================
    
    // 获取逾期账单列表（使用 customer_bills 表）
    app.get('/api/rent-management/overdue', isAuthenticated, (req, res) => {
        const { keyword, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;
        
        // 逾期定义：预付账单，本期起日期（period_start）早于今天且未收清
        let whereClause = "cb.status = 'unpaid' AND cb.period_start < CURDATE()";
        const params = [];
        
        if (keyword) {
            whereClause += ' AND (c.name LIKE ? OR cb.bill_number LIKE ?)';
            params.push(`%${keyword}%`, `%${keyword}%`);
        }
        
        const countQuery = `
            SELECT COUNT(*) as total 
            FROM customer_bills cb
            LEFT JOIN customers c ON cb.customer_id = c.id
            LEFT JOIN (
                SELECT DISTINCT bill_id
                FROM rent_bad_debt_approvals
                WHERE approval_status = 'approved'
            ) bad ON bad.bill_id = cb.id
            WHERE ${whereClause} AND bad.bill_id IS NULL
        `;
        
        const listQuery = `
            SELECT 
                cb.id,
                cb.bill_number,
                cb.customer_id,
                c.name as customer_name,
                cb.period_start,
                cb.period_end,
                cb.amount AS bill_amount,
                COALESCE(r.total_received, 0) AS received_amount,
                GREATEST(
                    cb.amount 
                    - COALESCE(r.total_received, 0) 
                    - COALESCE(cb.discount_amount, 0),
                    0
                ) AS remaining_amount,
                cb.period_start AS due_date,
                DATEDIFF(CURDATE(), cb.period_start) AS overdue_days
            FROM customer_bills cb
            LEFT JOIN customers c ON cb.customer_id = c.id
            LEFT JOIN (
                SELECT bill_id, SUM(received_amount) AS total_received
                FROM rent_received_records
                GROUP BY bill_id
            ) r ON r.bill_id = cb.id
            LEFT JOIN (
                SELECT DISTINCT bill_id
                FROM rent_bad_debt_approvals
                WHERE approval_status = 'approved'
            ) bad ON bad.bill_id = cb.id
            WHERE ${whereClause} AND bad.bill_id IS NULL
            ORDER BY overdue_days DESC, cb.period_start ASC
            LIMIT ? OFFSET ?
        `;
        
        db.query(countQuery, params, (err, countResult) => {
            if (err) {
                console.error('查询逾期账单总数失败:', err);
                return res.json({ success: false, message: '查询失败' });
            }
            
            const total = countResult[0].total;
            
            db.query(listQuery, [...params, parseInt(limit), parseInt(offset)], (err, bills) => {
                if (err) {
                    console.error('查询逾期账单列表失败:', err);
                    return res.json({ success: false, message: '查询失败' });
                }
                
                res.json({
                    success: true,
                    data: bills,
                    pagination: {
                        total: total,
                        page: parseInt(page),
                        limit: parseInt(limit),
                        totalPages: Math.ceil(total / limit)
                    }
                });
            });
        });
    });
    
    // 更新逾期状态（定时任务调用）- 在 customer_bills 表中逾期是动态计算的
    app.post('/api/rent-management/update-overdue-status', isAuthenticated, (req, res) => {
        // customer_bills 表中逾期状态是动态计算的（通过 period_start < CURDATE()）
        // 这个接口主要用于返回统计信息
        const query = `
            SELECT COUNT(*) as overdue_count
            FROM customer_bills cb
            LEFT JOIN (
                SELECT DISTINCT bill_id
                FROM rent_bad_debt_approvals
                WHERE approval_status = 'approved'
            ) bad ON bad.bill_id = cb.id
            WHERE cb.status = 'unpaid' AND cb.period_start < CURDATE() AND bad.bill_id IS NULL
        `;
        
        db.query(query, (err, result) => {
            if (err) {
                console.error('查询逾期状态失败:', err);
                return res.json({ success: false, message: '查询失败' });
            }
            
            res.json({ 
                success: true, 
                message: '逾期状态查询成功',
                overdue_count: result[0].overdue_count
            });
        });
    });
    
    // ==================== 4. 坏账 API ====================
    
    // 获取坏账列表（已审批通过的）
    app.get('/api/rent-management/bad-debt', isAuthenticated, (req, res) => {
        const { keyword, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;
        
        let whereClause = "rbd.approval_status = 'approved'";
        const params = [];
        
        if (keyword) {
            whereClause += ' AND (c.name LIKE ? OR cb.bill_number LIKE ?)';
            params.push(`%${keyword}%`, `%${keyword}%`);
        }
        
        const countQuery = `
            SELECT COUNT(*) as total 
            FROM customer_bills cb
            INNER JOIN rent_bad_debt_approvals rbd ON cb.id = rbd.bill_id
            LEFT JOIN customers c ON cb.customer_id = c.id
            WHERE ${whereClause}
        `;
        
        const listQuery = `
            SELECT 
                cb.*, c.name as customer_name,
                rbd.approval_time as bad_debt_time
            FROM customer_bills cb
            INNER JOIN rent_bad_debt_approvals rbd ON cb.id = rbd.bill_id
            LEFT JOIN customers c ON cb.customer_id = c.id
            WHERE ${whereClause}
            ORDER BY rbd.approval_time DESC
            LIMIT ? OFFSET ?
        `;
        
        db.query(countQuery, params, (err, countResult) => {
            if (err) {
                console.error('查询坏账总数失败:', err);
                return res.json({ success: false, message: '查询失败' });
            }
            
            const total = countResult[0].total;
            
            db.query(listQuery, [...params, parseInt(limit), parseInt(offset)], (err, bills) => {
                if (err) {
                    console.error('查询坏账列表失败:', err);
                    return res.json({ success: false, message: '查询失败' });
                }
                
                // 适配前端字段
                bills.forEach(bill => {
                    bill.bill_amount = bill.amount;
                    bill.updated_at = bill.bad_debt_time;
                });
                
                res.json({
                    success: true,
                    data: bills,
                    pagination: {
                        total: total,
                        page: parseInt(page),
                        limit: parseInt(limit),
                        totalPages: Math.ceil(total / limit)
                    }
                });
            });
        });
    });
    
    // 申请坏账认定（使用 customer_bills 的逾期账单）
    app.post('/api/rent-management/apply-bad-debt', isAuthenticated, (req, res) => {
        const { bill_id, reason, proof_files } = req.body;
        
        if (!bill_id || !reason) {
            return res.json({ success: false, message: '缺少必填参数' });
        }
        
        // 查询账单信息
        const billQuery = `
            SELECT cb.*, c.name as customer_name,
                   DATEDIFF(CURDATE(), cb.period_end) as overdue_days
            FROM customer_bills cb
            LEFT JOIN customers c ON cb.customer_id = c.id
            WHERE cb.id = ? AND cb.status = 'unpaid' AND cb.period_end < CURDATE()
        `;
        
        db.query(billQuery, [bill_id], (err, bills) => {
            if (err || bills.length === 0) {
                return res.json({ success: false, message: '账单不存在或状态不是逾期' });
            }
            
            const bill = bills[0];
            
            // 插入坏账审批记录
            const insertQuery = `
                INSERT INTO rent_bad_debt_approvals
                (bill_id, bill_number, customer_id, customer_name, bill_amount, overdue_days,
                 reason, proof_files, applicant_id, applicant_name)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            db.query(insertQuery, [
                bill_id, bill.bill_number, bill.customer_id, bill.customer_name,
                bill.amount, bill.overdue_days, reason, proof_files,
                req.session.user.id, req.session.user.real_name
            ], (err, result) => {
                if (err) {
                    console.error('申请坏账失败:', err);
                    return res.json({ success: false, message: '申请失败' });
                }
                
                res.json({ success: true, message: '坏账申请已提交，等待审批' });
            });
        });
    });
    
    // 获取坏账审批列表
    app.get('/api/rent-management/bad-debt-approvals', isAuthenticated, (req, res) => {
        const { status, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;
        
        let whereClause = '1=1';
        const params = [];
        
        if (status) {
            whereClause += ' AND approval_status = ?';
            params.push(status);
        }
        
        const countQuery = `SELECT COUNT(*) as total FROM rent_bad_debt_approvals WHERE ${whereClause}`;
        const listQuery = `
            SELECT *
            FROM rent_bad_debt_approvals
            WHERE ${whereClause}
            ORDER BY apply_time DESC
            LIMIT ? OFFSET ?
        `;
        
        db.query(countQuery, params, (err, countResult) => {
            if (err) {
                console.error('查询坏账审批总数失败:', err);
                return res.json({ success: false, message: '查询失败' });
            }
            
            const total = countResult[0].total;
            
            db.query(listQuery, [...params, parseInt(limit), parseInt(offset)], (err, approvals) => {
                if (err) {
                    console.error('查询坏账审批列表失败:', err);
                    return res.json({ success: false, message: '查询失败' });
                }
                
                res.json({
                    success: true,
                    data: approvals,
                    pagination: {
                        total: total,
                        page: parseInt(page),
                        limit: parseInt(limit),
                        totalPages: Math.ceil(total / limit)
                    }
                });
            });
        });
    });
    
    // 审批坏账（不修改 customer_bills 状态，仅记录审批结果）
    app.post('/api/rent-management/approve-bad-debt', isAuthenticated, (req, res) => {
        const { approval_id, action, notes } = req.body; // action: 'approve' | 'reject'
        
        if (!approval_id || !action) {
            return res.json({ success: false, message: '缺少必填参数' });
        }
        
        if (!['approve', 'reject'].includes(action)) {
            return res.json({ success: false, message: '无效的操作' });
        }
        
        // 查询审批记录
        const approvalQuery = 'SELECT * FROM rent_bad_debt_approvals WHERE id = ? AND approval_status = ?';
        db.query(approvalQuery, [approval_id, 'pending'], (err, approvals) => {
            if (err || approvals.length === 0) {
                return res.json({ success: false, message: '审批记录不存在或已处理' });
            }
            
            const newStatus = action === 'approve' ? 'approved' : 'rejected';
            
            // 更新审批记录
            const updateApprovalQuery = `
                UPDATE rent_bad_debt_approvals
                SET approval_status = ?, approver_id = ?, approver_name = ?,
                    approval_time = NOW(), approval_notes = ?
                WHERE id = ?
            `;
            
            db.query(updateApprovalQuery, [
                newStatus, req.session.user.id, req.session.user.real_name, notes, approval_id
            ], (err) => {
                if (err) {
                    console.error('更新审批记录失败:', err);
                    return res.json({ success: false, message: '审批失败' });
                }
                
                res.json({ success: true, message: '审批成功' });
            });
        });
    });
    
    // ==================== 5. 提前5天预警 API ====================
    
    // 获取预警列表
    app.get('/api/rent-management/alerts', isAuthenticated, (req, res) => {
        const { status, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;
        
        let whereClause = '1=1';
        const params = [];
        
        if (status) {
            whereClause += ' AND alert_status = ?';
            params.push(status);
        } else {
            whereClause += " AND alert_status = 'active'";
        }
        
        const countQuery = `SELECT COUNT(*) as total FROM rent_payment_alerts WHERE ${whereClause}`;
        const listQuery = `
            SELECT *
            FROM rent_payment_alerts
            WHERE ${whereClause}
            ORDER BY due_date ASC, created_at DESC
            LIMIT ? OFFSET ?
        `;
        
        db.query(countQuery, params, (err, countResult) => {
            if (err) {
                console.error('查询预警总数失败:', err);
                return res.json({ success: false, message: '查询失败' });
            }
            
            const total = countResult[0].total;
            
            db.query(listQuery, [...params, parseInt(limit), parseInt(offset)], (err, alerts) => {
                if (err) {
                    console.error('查询预警列表失败:', err);
                    return res.json({ success: false, message: '查询失败' });
                }
                
                res.json({
                    success: true,
                    data: alerts,
                    pagination: {
                        total: total,
                        page: parseInt(page),
                        limit: parseInt(limit),
                        totalPages: Math.ceil(total / limit)
                    }
                });
            });
        });
    });
    
    // 生成预警（定时任务调用，使用 customer_bills）
    app.post('/api/rent-management/generate-alerts', isAuthenticated, (req, res) => {
        const targetDate = moment().add(5, 'days').format('YYYY-MM-DD');
        
        // 查询即将到期的账单（使用 customer_bills）
        const billQuery = `
            SELECT cb.*, c.name as customer_name
            FROM customer_bills cb
            LEFT JOIN customers c ON cb.customer_id = c.id
            WHERE cb.status = 'unpaid' AND cb.period_end = ?
        `;
        
        db.query(billQuery, [targetDate], (err, bills) => {
            if (err) {
                console.error('查询即将到期账单失败:', err);
                return res.json({ success: false, message: '查询失败' });
            }
            
            if (bills.length === 0) {
                return res.json({ success: true, message: '没有需要预警的账单' });
            }
            
            // 检查是否已存在预警
            const existingAlertsQuery = `
                SELECT bill_id FROM rent_payment_alerts
                WHERE bill_id IN (?) AND alert_status = 'active'
            `;
            
            const billIds = bills.map(b => b.id);
            
            db.query(existingAlertsQuery, [billIds], (err, existingAlerts) => {
                if (err) {
                    console.error('查询现有预警失败:', err);
                    return res.json({ success: false, message: '查询失败' });
                }
                
                const existingBillIds = new Set(existingAlerts.map(a => a.bill_id));
                const newBills = bills.filter(b => !existingBillIds.has(b.id));
                
                if (newBills.length === 0) {
                    return res.json({ success: true, message: '预警已存在' });
                }
                
                // 插入新预警
                const insertQuery = `
                    INSERT INTO rent_payment_alerts
                    (bill_id, bill_number, customer_id, customer_name, due_date, bill_amount, days_before_due, alert_type)
                    VALUES ?
                `;
                
                const values = newBills.map(b => [
                    b.id, b.bill_number, b.customer_id, b.customer_name,
                    b.period_end, b.amount, 5, 'payment_due'
                ]);
                
                db.query(insertQuery, [values], (err, result) => {
                    if (err) {
                        console.error('生成预警失败:', err);
                        return res.json({ success: false, message: '生成预警失败' });
                    }
                    

                    res.json({ 
                        success: true, 
                        message: `成功生成 ${newBills.length} 条预警`,
                        alertCount: newBills.length
                    });


            });
        });
    });
    });
    
    // 处理预警（标记为已处理）
    app.post('/api/rent-management/process-alert/:id', isAuthenticated, (req, res) => {
        const alertId = req.params.id;
        
        const updateQuery = `
            UPDATE rent_payment_alerts
            SET alert_status = 'processed', updated_at = NOW()
            WHERE id = ?
        `;
        
        db.query(updateQuery, [alertId], (err, result) => {
            if (err) {
                console.error('处理预警失败:', err);
                return res.json({ success: false, message: '处理失败' });
            }
            
            res.json({ success: true, message: '预警已处理' });
        });
    });
    
};
