// backend/server.js
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Configuração do banco SQLite
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// Criar tabela se não existir
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      completed BOOLEAN DEFAULT 0,
      priority TEXT DEFAULT 'medium',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// ROUTES

// GET - Listar todas as tarefas
app.get('/api/tasks', (req, res) => {
  console.log('GET /api/tasks - Buscando todas as tarefas');
  
  db.all('SELECT * FROM tasks ORDER BY createdAt DESC', (err, rows) => {
    if (err) {
      console.error('Erro ao buscar tarefas:', err);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
    
    console.log(`Encontradas ${rows.length} tarefas`);
    res.json({
      success: true,
      data: rows,
      count: rows.length
    });
  });
});

// GET - Buscar tarefa por ID
app.get('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  console.log(`GET /api/tasks/${id} - Buscando tarefa específica`);
  
  db.get('SELECT * FROM tasks WHERE id = ?', [id], (err, row) => {
    if (err) {
      console.error('Erro ao buscar tarefa:', err);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
    
    if (!row) {
      console.log(`Tarefa ${id} não encontrada`);
      return res.status(404).json({ error: 'Tarefa não encontrada' });
    }
    
    console.log(`Tarefa ${id} encontrada:`, row.title);
    res.json({
      success: true,
      data: row
    });
  });
});

// POST - Criar nova tarefa
app.post('/api/tasks', (req, res) => {
  const { title, description, priority = 'medium' } = req.body;
  
  console.log('POST /api/tasks - Criando nova tarefa:', { title, description, priority });
  
  // Validação
  if (!title || title.trim() === '') {
    return res.status(400).json({ error: 'Título é obrigatório' });
  }
  
  if (priority && !['low', 'medium', 'high'].includes(priority)) {
    return res.status(400).json({ error: 'Prioridade deve ser: low, medium ou high' });
  }
  
  const stmt = db.prepare(`
    INSERT INTO tasks (title, description, priority, createdAt, updatedAt)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);
  
  stmt.run([title.trim(), description || '', priority], function(err) {
    if (err) {
      console.error('Erro ao criar tarefa:', err);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
    
    console.log(`Tarefa criada com ID: ${this.lastID}`);
    
    // Buscar a tarefa recém-criada para retornar
    db.get('SELECT * FROM tasks WHERE id = ?', [this.lastID], (err, row) => {
      if (err) {
        console.error('Erro ao buscar tarefa criada:', err);
        return res.status(500).json({ error: 'Tarefa criada, mas erro ao buscar dados' });
      }
      
      res.status(201).json({
        success: true,
        message: 'Tarefa criada com sucesso',
        data: row
      });
    });
  });
  
  stmt.finalize();
});

// PUT - Atualizar tarefa
app.put('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  const { title, description, completed, priority } = req.body;
  
  console.log(`PUT /api/tasks/${id} - Atualizando tarefa:`, req.body);
  
  // Primeiro verificar se a tarefa existe
  db.get('SELECT * FROM tasks WHERE id = ?', [id], (err, row) => {
    if (err) {
      console.error('Erro ao buscar tarefa para atualizar:', err);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
    
    if (!row) {
      console.log(`Tarefa ${id} não encontrada para atualização`);
      return res.status(404).json({ error: 'Tarefa não encontrada' });
    }
    
    // Validações
    if (title !== undefined && title.trim() === '') {
      return res.status(400).json({ error: 'Título não pode estar vazio' });
    }
    
    if (priority !== undefined && !['low', 'medium', 'high'].includes(priority)) {
      return res.status(400).json({ error: 'Prioridade deve ser: low, medium ou high' });
    }
    
    // Preparar campos para atualização
    const updateFields = [];
    const updateValues = [];
    
    if (title !== undefined) {
      updateFields.push('title = ?');
      updateValues.push(title.trim());
    }
    
    if (description !== undefined) {
      updateFields.push('description = ?');
      updateValues.push(description);
    }
    
    if (completed !== undefined) {
      updateFields.push('completed = ?');
      updateValues.push(completed ? 1 : 0);
    }
    
    if (priority !== undefined) {
      updateFields.push('priority = ?');
      updateValues.push(priority);
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }
    
    updateFields.push('updatedAt = CURRENT_TIMESTAMP');
    updateValues.push(id);
    
    const sql = `UPDATE tasks SET ${updateFields.join(', ')} WHERE id = ?`;
    
    db.run(sql, updateValues, function(err) {
      if (err) {
        console.error('Erro ao atualizar tarefa:', err);
        return res.status(500).json({ error: 'Erro interno do servidor' });
      }
      
      console.log(`Tarefa ${id} atualizada com sucesso`);
      
      // Buscar a tarefa atualizada
      db.get('SELECT * FROM tasks WHERE id = ?', [id], (err, updatedRow) => {
        if (err) {
          console.error('Erro ao buscar tarefa atualizada:', err);
          return res.status(500).json({ error: 'Tarefa atualizada, mas erro ao buscar dados' });
        }
        
        res.json({
          success: true,
          message: 'Tarefa atualizada com sucesso',
          data: updatedRow
        });
      });
    });
  });
});

// DELETE - Deletar tarefa
app.delete('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  console.log(`DELETE /api/tasks/${id} - Deletando tarefa`);
  
  // Primeiro verificar se a tarefa existe
  db.get('SELECT * FROM tasks WHERE id = ?', [id], (err, row) => {
    if (err) {
      console.error('Erro ao buscar tarefa para deletar:', err);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
    
    if (!row) {
      console.log(`Tarefa ${id} não encontrada para exclusão`);
      return res.status(404).json({ error: 'Tarefa não encontrada' });
    }
    
    // Deletar a tarefa
    db.run('DELETE FROM tasks WHERE id = ?', [id], function(err) {
      if (err) {
        console.error('Erro ao deletar tarefa:', err);
        return res.status(500).json({ error: 'Erro interno do servidor' });
      }
      
      console.log(`Tarefa ${id} (${row.title}) deletada com sucesso`);
      res.json({
        success: true,
        message: 'Tarefa deletada com sucesso',
        data: row
      });
    });
  });
});

// Rota de saúde da API
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'API funcionando corretamente',
    timestamp: new Date().toISOString()
  });
});

// Middleware de tratamento de erros
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  res.status(500).json({
    error: 'Erro interno do servidor',
    message: err.message
  });
});

// Middleware para rotas não encontradas
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Rota não encontrada',
    path: req.originalUrl
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📊 API disponível em: http://localhost:${PORT}/api`);
  console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
  console.log('📝 Endpoints disponíveis:');
  console.log('  GET    /api/tasks      - Listar tarefas');
  console.log('  GET    /api/tasks/:id  - Buscar tarefa');
  console.log('  POST   /api/tasks      - Criar tarefa');
  console.log('  PUT    /api/tasks/:id  - Atualizar tarefa');
  console.log('  DELETE /api/tasks/:id  - Deletar tarefa');
});

// Fechamento gracioso do banco
process.on('SIGINT', () => {
  console.log('\n🔄 Fechando conexão com o banco de dados...');
  db.close((err) => {
    if (err) {
      console.error('Erro ao fechar banco:', err);
    } else {
      console.log('✅ Banco de dados fechado com sucesso');
    }
    process.exit(0);
  });
});