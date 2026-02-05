/**
 * Basic manual test for session storage
 * Run with: npx tsx src/test-session-storage.ts
 */

import { sessionStorage } from './session-storage.js';
import type { SavedSession } from './session-storage.js';

async function testSessionStorage() {
  console.log('🧪 Testing Session Storage...\n');

  try {
    // Test 1: Create a test session
    console.log('Test 1: Creating a test session...');
    const testSession: SavedSession = {
      metadata: {
        sessionId: 'test-session-001',
        projectId: 'test-project-001',
        projectPath: '/test/project',
        projectName: 'Test Project',
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        status: 'active',
        permissionMode: 'default',
        claudeSessionId: 'claude-test-001',
        stats: {
          totalPrompts: 1,
          totalMessages: 2,
          totalToolUses: 3,
          totalTokens: 1000,
          totalCost: 0.01,
          duration: 5000,
        },
      },
      timeline: [
        {
          timestamp: new Date().toISOString(),
          type: 'message',
          data: { role: 'user', content: 'Test message' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: 'Test message',
          timestamp: new Date().toISOString(),
        },
      ],
      toolExecutions: [],
      fileChanges: [],
      tasks: [],
      taskAgents: [],
      approvals: [],
      questions: [],
    };

    await sessionStorage.saveSession('test-session-001', testSession);
    console.log('✓ Session created successfully\n');

    // Test 2: Load the session
    console.log('Test 2: Loading the session...');
    const loaded = await sessionStorage.loadSession('test-session-001');
    if (!loaded) {
      throw new Error('Failed to load session');
    }
    console.log('✓ Session loaded successfully');
    console.log('  Session ID:', loaded.metadata.sessionId);
    console.log('  Project:', loaded.metadata.projectName);
    console.log('  Messages:', loaded.messages.length);
    console.log('  Status:', loaded.metadata.status);
    console.log('');

    // Test 3: Update the session
    console.log('Test 3: Updating the session...');
    await sessionStorage.updateSession('test-session-001', {
      metadata: {
        ...testSession.metadata,
        status: 'completed',
        stats: {
          ...testSession.metadata.stats,
          totalMessages: 5,
        },
      },
    });
    const updated = await sessionStorage.loadSession('test-session-001');
    if (!updated || updated.metadata.status !== 'completed') {
      throw new Error('Failed to update session');
    }
    console.log('✓ Session updated successfully');
    console.log('  New status:', updated.metadata.status);
    console.log('  New message count:', updated.metadata.stats.totalMessages);
    console.log('');

    // Test 4: List sessions
    console.log('Test 4: Listing all sessions...');
    const allSessions = await sessionStorage.listSessions();
    console.log('✓ Found', allSessions.length, 'session(s)');
    if (allSessions.length > 0) {
      console.log('  First session:', allSessions[0].sessionId);
    }
    console.log('');

    // Test 5: Filter by project
    console.log('Test 5: Filtering sessions by project...');
    const projectSessions = await sessionStorage.getSessionsByProject('test-project-001');
    console.log('✓ Found', projectSessions.length, 'session(s) for project test-project-001');
    console.log('');

    // Test 6: Active session tracking
    console.log('Test 6: Testing active session tracking...');
    await sessionStorage.markSessionActive('test-session-001', 'claude-test-002');
    const activeSessions = await sessionStorage.getActiveSessions();
    console.log('✓ Active sessions:', activeSessions.length);
    if (activeSessions.length > 0) {
      console.log('  Active session:', activeSessions[0].sessionId);
      console.log('  Claude session ID:', activeSessions[0].claudeSessionId);
    }
    console.log('');

    // Test 7: Mark complete
    console.log('Test 7: Marking session as complete...');
    await sessionStorage.markSessionComplete('test-session-001');
    const activeAfterComplete = await sessionStorage.getActiveSessions();
    console.log('✓ Session marked complete');
    console.log('  Active sessions after:', activeAfterComplete.length);
    console.log('');

    // Test 8: Delete the session
    console.log('Test 8: Deleting the session...');
    await sessionStorage.deleteSession('test-session-001');
    const deletedSession = await sessionStorage.loadSession('test-session-001');
    if (deletedSession) {
      throw new Error('Session was not deleted');
    }
    console.log('✓ Session deleted successfully\n');

    console.log('✅ All tests passed!\n');
    console.log('📁 Sessions are stored in: ~/.claude-mobile-bridge/sessions/');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run tests
testSessionStorage().then(() => {
  console.log('Test completed');
  process.exit(0);
});
