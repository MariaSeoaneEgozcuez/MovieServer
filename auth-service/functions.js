export async function getUserbyUsername(username) {
    try {
        const db = await open({
            filename: config.get('db.filename'),
            driver: sqlite3.Database
        });
        const user = await db.get('SELECT * FROM Usuarios WHERE username = ?', [username]);
        await db.close();
        return mapDbUser(user);
    } catch (error) {
        console.error('Error buscando usuario:', error);
        return null;
    }
}

export async function createUser(username, email, password) {
    
    const db = await open({
        filename: config.get('db.filename'),
        driver: sqlite3.Database
    });
    const result = await db.run('INSERT INTO Usuarios (username, email, password) VALUES (?, ?, ?)', [username, email, password]);
    await db.close();
    return {
        id: result.lastID,
        username,
        email,
        password
    };
}