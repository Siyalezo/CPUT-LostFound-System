const mysql = require('mysql2');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');

const app = express();

// MySQL connection config
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '', // set your password if any
    database: 'lost_found'
});

// Connect to MySQL
db.connect(err => {
    if (err) {
        console.error('❌ MySQL connection error:', err.message);
    } else {
        console.log('✅ Connected to MySQL database');
    }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // serve static files if needed

// Base route
app.get('/', (req, res) => {
    res.send('🔍 Lost & Found API running...');
});

// Login endpoint
app.post('/login', (req, res) => {
    const { usernameOrEmail, password } = req.body;

    if (!usernameOrEmail || !password) return res.status(400).send('Username/email and password are required.');

    const sql = `SELECT UserID, PasswordHash, Role, FullName, Email FROM student_staff WHERE UserID = ? OR Email = ? LIMIT 1`;

    db.query(sql, [usernameOrEmail, usernameOrEmail], (err, results) => {
        if (err) {
            console.error('DB error during login:', err.message);
            return res.status(500).send('Database error during login.');
        }

        if (results.length === 0) return res.status(401).send('Invalid username/email or password.');

        const user = results[0];
        if (!user.PasswordHash) return res.status(500).send('Internal server error: incomplete user data.');

        bcrypt.compare(password, user.PasswordHash, (bcryptErr, isMatch) => {
            if (bcryptErr) {
                console.error('Bcrypt error:', bcryptErr.message);
                return res.status(500).send('Password verification failed.');
            }
            if (!isMatch) return res.status(401).send('Invalid username/email or password.');

            const updateLoginTime = `UPDATE student_staff SET LastLogin = NOW() WHERE UserID = ?`;
            db.query(updateLoginTime, [user.UserID], (updateErr) => {
                if (updateErr) console.warn('Could not update LastLogin:', updateErr.message);

                res.json({
                    message: 'Login successful!',
                    userId: user.UserID,
                    role: user.Role,
                    name: user.FullName,
                    email: user.Email
                });
            });
        });
    });
});

// Register endpoint
app.post('/register', async (req, res) => {
    const { userId, name, email, phoneNumber, password } = req.body;

    if (!userId || !name || !email || !password) {
        return res.status(400).send('UserID, name, email, and password are required.');
    }

    let role = 'User';
    if (email.endsWith('@cput.ac.za')) role = 'Admin';
    else if (!email.endsWith('@mycput.ac.za')) {
        return res.status(400).send('Invalid email domain. Only @cput.ac.za or @mycput.ac.za are allowed.');
    }

    try {
        const passwordHash = await bcrypt.hash(password, 10);
        const sql = `INSERT INTO student_staff (UserID, FullName, Email, PhoneNumber, PasswordHash, Role) VALUES (?, ?, ?, ?, ?, ?)`;

        db.query(sql, [userId, name, email, phoneNumber || null, passwordHash, role], (err) => {
            if (err) {
                console.error('DB error during registration:', err.message);
                if (err.code === 'ER_DUP_ENTRY') {
                    if (err.sqlMessage.includes('UserID')) return res.status(409).send('User ID already exists.');
                    if (err.sqlMessage.includes('Email')) return res.status(409).send('Email already registered.');
                }
                return res.status(500).send('Error registering user.');
            }
            res.status(201).send('User registered successfully!');
        });
    } catch (error) {
        console.error('Error hashing password:', error);
        res.status(500).send('Internal server error.');
    }
});

// Add Lost Item
app.post('/lost', (req, res) => {
    const { title, description, date_lost_found, reported_by_user_id, location_id, category_id, image_url } = req.body;

    if (!title || !description || !date_lost_found || !reported_by_user_id || !location_id || !category_id) {
        return res.status(400).send('Missing required fields.');
    }

    const sql = `INSERT INTO items (Title, Description, ItemType, DateLostFound, ReportedByUserID, LocationID, CategoryID, CurrentStatus, ImageURL)
                 VALUES (?, ?, 'Lost', ?, ?, ?, ?, 'Active', ?)`;

    db.query(sql, [title, description, date_lost_found, reported_by_user_id, location_id, category_id, image_url || null], (err) => {
        if (err) {
            console.error('DB error adding lost item:', err.message);
            return res.status(500).send('Error adding lost item.');
        }
        res.status(201).send('Lost item reported successfully!');
    });
});

// Add Found Item
app.post('/found', (req, res) => {
    const { title, description, date_lost_found, reported_by_user_id, location_id, category_id, image_url } = req.body;

    if (!title || !description || !date_lost_found || !reported_by_user_id || !location_id || !category_id) {
        return res.status(400).send('Missing required fields.');
    }

    const sql = `INSERT INTO items (Title, Description, ItemType, DateLostFound, ReportedByUserID, LocationID, CategoryID, CurrentStatus, ImageURL)
                 VALUES (?, ?, 'Found', ?, ?, ?, ?, 'Active', ?)`;

    db.query(sql, [title, description, date_lost_found, reported_by_user_id, location_id, category_id, image_url || null], (err) => {
        if (err) {
            console.error('DB error adding found item:', err.message);
            return res.status(500).send('Error adding found item.');
        }
        res.status(201).send('Found item reported successfully!');
    });
});

// Get lost items, optionally limited
app.get('/lost', (req, res) => {
    let limit = parseInt(req.query.limit) || 20;

    const sql = `
        SELECT i.ItemID, i.Title, i.Description, i.DateLostFound, l.LocationName, c.CategoryName
        FROM items i
        JOIN locations l ON i.LocationID = l.LocationID
        JOIN categories c ON i.CategoryID = c.CategoryID
        WHERE i.ItemType = 'Lost' AND i.CurrentStatus = 'Active'
        ORDER BY i.DateReported DESC
        LIMIT ?`;

    db.query(sql, [limit], (err, results) => {
        if (err) {
            console.error('DB error fetching lost items:', err.message);
            return res.status(500).send('Error fetching lost items.');
        }
        res.json(results);
    });
});

// Get found items, optionally limited
app.get('/found', (req, res) => {
    let limit = parseInt(req.query.limit) || 20;

    const sql = `
        SELECT i.ItemID, i.Title, i.Description, i.DateLostFound, l.LocationName, c.CategoryName
        FROM items i
        JOIN locations l ON i.LocationID = l.LocationID
        JOIN categories c ON i.CategoryID = c.CategoryID
        WHERE i.ItemType = 'Found' AND i.CurrentStatus = 'Active'
        ORDER BY i.DateReported DESC
        LIMIT ?`;

    db.query(sql, [limit], (err, results) => {
        if (err) {
            console.error('DB error fetching found items:', err.message);
            return res.status(500).send('Error fetching found items.');
        }
        res.json(results);
    });
});

// Get categories
app.get('/categories', (req, res) => {
    const sql = 'SELECT * FROM categories ORDER BY CategoryName';

    db.query(sql, (err, results) => {
        if (err) {
            console.error('DB error fetching categories:', err.message);
            return res.status(500).send('Error fetching categories.');
        }
        res.json(results);
    });
});

// Get locations
app.get('/locations', (req, res) => {
    const sql = 'SELECT * FROM locations ORDER BY LocationName';

    db.query(sql, (err, results) => {
        if (err) {
            console.error('DB error fetching locations:', err.message);
            return res.status(500).send('Error fetching locations.');
        }
        res.json(results);
    });
});

// Get stats - total lost items
app.get('/stats/lost', (req, res) => {
    const sql = `SELECT COUNT(*) AS count FROM items WHERE ItemType = 'Lost' AND CurrentStatus = 'Active'`;

    db.query(sql, (err, results) => {
        if (err) {
            console.error('DB error fetching lost stats:', err.message);
            return res.status(500).send('Error fetching lost stats.');
        }
        res.json({ count: results[0].count });
    });
});

// Get stats - total found items
app.get('/stats/found', (req, res) => {
    const sql = `SELECT COUNT(*) AS count FROM items WHERE ItemType = 'Found' AND CurrentStatus = 'Active'`;

    db.query(sql, (err, results) => {
        if (err) {
            console.error('DB error fetching found stats:', err.message);
            return res.status(500).send('Error fetching found stats.');
        }
        res.json({ count: results[0].count });
    });
});

// Get stats - user's reported items count
app.get('/stats/myreported/:userId', (req, res) => {
    const userId = req.params.userId;

    const sql = `SELECT COUNT(*) AS count FROM items WHERE ReportedByUserID = ? AND CurrentStatus = 'Active'`;

    db.query(sql, [userId], (err, results) => {
        if (err) {
            console.error('DB error fetching myreported stats:', err.message);
            return res.status(500).send('Error fetching my reported stats.');
        }
        res.json({ count: results[0].count });
    });
});

// Start server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
