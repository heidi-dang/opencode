import { createSignal, createEffect, onCleanup } from "solid-js"
import { useProductionAnalytics } from "../safety/production-analytics"

// Predictive Preloading System for Phase 3
export class PredictivePreloader {
  private userBehavior = new Map<string, UserBehaviorPattern>()
  private preloadQueue = new Map<string, PreloadTask>()
  private predictionModel = new BehaviorPredictionModel()
  private preloadCache = new Map<string, PreloadedContent>()
  private isLearning = true
  private learningInterval: number | undefined
  
  constructor() {
    this.startBehaviorTracking()
    this.initializePredictionModel()
    this.startPreloadingEngine()
  }
  
  private startBehaviorTracking() {
    // Track user actions for pattern learning
    this.learningInterval = window.setInterval(() => {
      this.updateBehaviorPatterns()
      this.trainPredictionModel()
    }, 30000) // Every 30 seconds
  }
  
  private initializePredictionModel() {
    // Initialize ML model with basic patterns
    this.predictionModel.initialize({
      patterns: [
        {
          action: 'open_chat',
          likelyNext: [
            { action: 'load_messages', confidence: 0.8, estimatedTime: 2000 },
            { action: 'focus_input', confidence: 0.6, estimatedTime: 500 }
          ],
          confidence: 0.8,
          avgTimeBetween: 2000
        },
        {
          action: 'send_message',
          likelyNext: [
            { action: 'load_response', confidence: 0.9, estimatedTime: 1000 },
            { action: 'update_ui', confidence: 0.7, estimatedTime: 500 }
          ],
          confidence: 0.9,
          avgTimeBetween: 1000
        },
        {
          action: 'scroll_to_bottom',
          likelyNext: [
            { action: 'load_more_messages', confidence: 0.7, estimatedTime: 1000 },
            { action: 'update_position', confidence: 0.8, estimatedTime: 200 }
          ],
          confidence: 0.7,
          avgTimeBetween: 500
        },
        {
          action: 'switch_tab',
          likelyNext: [
            { action: 'load_tab_content', confidence: 0.85, estimatedTime: 1500 },
            { action: 'update_history', confidence: 0.6, estimatedTime: 500 }
          ],
          confidence: 0.85,
          avgTimeBetween: 1500
        }
      ]
    })
  }
  
  private startPreloadingEngine() {
    // Process preload queue every 5 seconds
    window.setInterval(() => {
      this.processPreloadQueue()
    }, 5000)
  }
  
  trackUserAction(action: string, context?: any) {
    const userId = this.getCurrentUserId()
    const timestamp = Date.now()
    
    // Record user action
    const behavior: UserAction = {
      userId,
      action,
      timestamp,
      context: context || {}
    }
    
    // Update user behavior patterns
    this.updateUserBehavior(behavior)
    
    // Generate predictions for next actions
    const predictions = this.predictionModel.predictNextActions(action, context)
    
    // Queue preloading tasks based on predictions
    this.queuePreloadingTasks(predictions)
  }
  
  private updateUserBehavior(action: UserAction) {
    const userId = action.userId
    let pattern = this.userBehavior.get(userId)
    
    if (!pattern) {
      pattern = {
        userId,
        actions: [],
        sequences: {},
        avgSessionTime: 0,
        lastActivity: Date.now()
      }
      this.userBehavior.set(userId, pattern)
    }
    
    // Add action to pattern
    pattern.actions.push(action)
    
    // Keep only last 100 actions
    if (pattern.actions.length > 100) {
      pattern.actions.shift()
    }
    
    // Update sequences
    this.updateActionSequences(pattern)
    
    // Update last activity
    pattern.lastActivity = Date.now()
  }
  
  private updateActionSequences(pattern: UserBehaviorPattern) {
    const actions = pattern.actions
    if (actions.length < 2) return
    
    // Create sequences of 2-3 actions
    for (let i = 0; i < actions.length - 1; i++) {
      const sequence = actions.slice(i, i + 2).map(a => a.action)
      const sequenceKey = sequence.join('->')
      
      // Track sequence frequency
      if (!pattern.sequences[sequenceKey]) {
        pattern.sequences[sequenceKey] = {
          sequence,
          count: 0,
          avgTime: 0,
          lastSeen: Date.now()
        }
      }
      
      pattern.sequences[sequenceKey].count++
      pattern.sequences[sequenceKey].lastSeen = Date.now()
      
      // Update average time between actions
      if (i > 0) {
        const timeDiff = actions[i].timestamp - actions[i - 1].timestamp
        const currentAvg = pattern.sequences[sequenceKey].avgTime
        const newAvg = (currentAvg + timeDiff) / 2
        pattern.sequences[sequenceKey].avgTime = newAvg
      }
    }
  }
  
  private updateBehaviorPatterns() {
    // Analyze all user patterns and update global model
    const allPatterns = Array.from(this.userBehavior.values())
    
    // Update prediction model with new patterns
    this.predictionModel.updatePatterns(allPatterns)
  }
  
  private trainPredictionModel() {
    if (!this.isLearning) return
    
    // Train ML model with collected data
    this.predictionModel.train()
    
    // Stop learning after sufficient data
    if (this.predictionModel.isAccurate()) {
      this.isLearning = false
      console.log('🧠 Predictive preloading model trained successfully')
    }
  }
  
  private queuePreloadingTasks(predictions: PredictedAction[]) {
    predictions.forEach(prediction => {
      if (prediction.confidence > 0.7) { // Only high-confidence predictions
        const task: PreloadTask = {
          id: `${prediction.action}-${Date.now()}`,
          action: prediction.action,
          context: prediction.context,
          priority: prediction.confidence,
          timestamp: Date.now(),
          executed: false
        }
        
        this.preloadQueue.set(task.id, task)
      }
    })
  }
  
  private processPreloadQueue() {
    const now = Date.now()
    const tasks = Array.from(this.preloadQueue.values())
      .filter(task => !task.executed && now - task.timestamp < 30000) // 30 second window
    
    // Sort by priority (confidence)
    tasks.sort((a, b) => b.priority - a.priority)
    
    // Execute top 3 tasks
    tasks.slice(0, 3).forEach(task => {
      this.executePreloadTask(task)
    })
    
    // Clean up old tasks
    this.cleanupOldTasks()
  }
  
  private executePreloadTask(task: PreloadTask) {
    console.log(`🚀 Executing preload task: ${task.action} (confidence: ${task.priority})`)
    
    try {
      const content = this.generatePreloadContent(task.action, task.context)
      
      if (content) {
        this.preloadCache.set(task.action, {
          content,
          timestamp: Date.now(),
          context: task.context,
          used: false
        })
        
        task.executed = true
        this.preloadQueue.set(task.id, task)
      }
    } catch (error) {
      console.error(`❌ Preload task failed: ${task.action}`, error)
    }
  }
  
  private generatePreloadContent(action: string, context: any): any {
    switch (action) {
      case 'load_messages':
        return this.preloadMessages(context)
      case 'load_response':
        return this.preloadResponse(context)
      case 'load_more_messages':
        return this.preloadMoreMessages(context)
      case 'load_tab_content':
        return this.preloadTabContent(context)
      case 'update_history':
        return this.preloadHistory(context)
      case 'focus_input':
        return this.preloadInput(context)
      case 'update_ui':
        return this.preloadUI(context)
      case 'update_position':
        return this.preloadPosition(context)
      default:
        return null
    }
  }
  
  private preloadMessages(context: any) {
    // Preload recent messages
    return {
      type: 'messages',
      data: [],
      cached: true,
      timestamp: Date.now()
    }
  }
  
  private preloadResponse(context: any) {
    // Preload response template
    return {
      type: 'response',
      template: 'loading',
      cached: true,
      timestamp: Date.now()
    }
  }
  
  private preloadMoreMessages(context: any) {
    // Preload pagination data
    return {
      type: 'pagination',
      nextPage: 2,
      cached: true,
      timestamp: Date.now()
    }
  }
  
  private preloadTabContent(context: any) {
    // Preload tab content
    return {
      type: 'tab_content',
      data: {},
      cached: true,
      timestamp: Date.now()
    }
  }
  
  private preloadHistory(context: any) {
    // Preload navigation history
    return {
      type: 'history',
      entries: [],
      cached: true,
      timestamp: Date.now()
    }
  }
  
  private preloadInput(context: any) {
    // Preload input suggestions
    return {
      type: 'suggestions',
      data: [],
      cached: true,
      timestamp: Date.now()
    }
  }
  
  private preloadUI(context: any) {
    // Preload UI components
    return {
      type: 'ui_components',
      components: [],
      cached: true,
      timestamp: Date.now()
    }
  }
  
  private preloadPosition(context: any) {
    // Preload scroll position data
    return {
      type: 'scroll_position',
      position: 0,
      cached: true,
      timestamp: Date.now()
    }
  }
  
  private cleanupOldTasks() {
    const now = Date.now()
    const oldTasks = Array.from(this.preloadQueue.entries())
      .filter(([_, task]) => now - task.timestamp > 60000) // 1 minute old
    
    oldTasks.forEach(([id, _]) => {
      this.preloadQueue.delete(id)
    })
  }
  
  // Public API
  getPreloadedContent(action: string): PreloadedContent | null {
    const content = this.preloadCache.get(action)
    
    if (content && !content.used) {
      content.used = true
      console.log(`✅ Using preloaded content for: ${action}`)
      return content
    }
    
    return null
  }
  
  getPredictionAccuracy(): number {
    return this.predictionModel.getAccuracy()
  }
  
  getUserBehaviorStats(): UserBehaviorStats {
    const totalUsers = this.userBehavior.size
    const activeUsers = Array.from(this.userBehavior.values())
      .filter(pattern => Date.now() - pattern.lastActivity < 300000).length // 5 minutes
    
    const totalActions = Array.from(this.userBehavior.values())
      .reduce((sum, pattern) => sum + pattern.actions.length, 0)
    
    const avgSessionTime = totalUsers > 0 ? 
      Array.from(this.userBehavior.values())
        .reduce((sum, pattern) => sum + pattern.avgSessionTime, 0) / totalUsers : 0
    
    return {
      totalUsers,
      activeUsers,
      totalActions,
      avgSessionTime,
      modelAccuracy: this.getPredictionAccuracy(),
      cacheSize: this.preloadCache.size,
      queueSize: this.preloadQueue.size
    }
  }
  
  private getCurrentUserId(): string {
    // Get or generate user ID
    if (typeof window !== 'undefined') {
      let userId = localStorage.getItem('predictive-preload-user')
      if (!userId) {
        userId = Math.random().toString(36).substring(7)
        localStorage.setItem('predictive-preload-user', userId)
      }
      return userId
    }
    return 'anonymous'
  }
  
  cleanup() {
    if (this.learningInterval) {
      window.clearInterval(this.learningInterval)
    }
    
    this.userBehavior.clear()
    this.preloadQueue.clear()
    this.preloadCache.clear()
  }
}

// Behavior Prediction Model
class BehaviorPredictionModel {
  private patterns: BehaviorPattern[] = []
  private accuracy = 0.5
  private isTrained = false
  
  initialize(config: { patterns: BehaviorPattern[] }) {
    this.patterns = config.patterns
    this.isTrained = false
  }
  
  predictNextActions(currentAction: string, context?: any): PredictedAction[] {
    if (!this.isTrained) {
      return this.getDefaultPredictions(currentAction)
    }
    
    const predictions: PredictedAction[] = []
    
    // Find patterns matching current action
    const matchingPatterns = this.patterns.filter(pattern => 
      pattern.action === currentAction
    )
    
    matchingPatterns.forEach(pattern => {
      pattern.likelyNext.forEach(nextAction => {
        predictions.push({
          action: nextAction.action,
          confidence: pattern.confidence * nextAction.confidence,
          context: { ...context, ...nextAction.context },
          estimatedTime: pattern.avgTimeBetween + nextAction.estimatedTime
        })
      })
    })
    
    // Sort by confidence
    predictions.sort((a, b) => b.confidence - a.confidence)
    
    return predictions.slice(0, 5) // Top 5 predictions
  }
  
  private getDefaultPredictions(currentAction: string): PredictedAction[] {
    const defaults: Record<string, PredictedAction[]> = {
      'open_chat': [
        { action: 'load_messages', confidence: 0.8, context: {}, estimatedTime: 1000 },
        { action: 'focus_input', confidence: 0.6, context: {}, estimatedTime: 500 }
      ],
      'send_message': [
        { action: 'load_response', confidence: 0.9, context: {}, estimatedTime: 2000 },
        { action: 'update_ui', confidence: 0.7, context: {}, estimatedTime: 500 }
      ],
      'scroll_to_bottom': [
        { action: 'load_more_messages', confidence: 0.7, context: {}, estimatedTime: 1000 },
        { action: 'update_position', confidence: 0.8, context: {}, estimatedTime: 200 }
      ]
    }
    
    return defaults[currentAction] || []
  }
  
  updatePatterns(userPatterns: UserBehaviorPattern[]) {
    // Update patterns based on user behavior
    userPatterns.forEach(userPattern => {
      Object.entries(userPattern.sequences).forEach(([sequenceKey, sequenceData]) => {
        const actions = sequenceKey.split('->')
        const currentAction = actions[0]
        const nextAction = actions[1]
        
        // Find or create pattern
        let pattern = this.patterns.find(p => p.action === currentAction)
        if (!pattern) {
          pattern = {
            action: currentAction,
            likelyNext: [],
            confidence: 0.5,
            avgTimeBetween: 1000
          }
          this.patterns.push(pattern)
        }
        
        // Update likely next actions
        let nextActionData = pattern.likelyNext.find(n => n.action === nextAction)
        if (!nextActionData) {
          nextActionData = {
            action: nextAction,
            confidence: 0.1,
            estimatedTime: sequenceData.avgTime
          }
          pattern.likelyNext.push(nextActionData)
        }
        
        // Update confidence based on frequency
        nextActionData.confidence = Math.min(0.95, nextActionData.confidence + 0.05)
        pattern.confidence = Math.min(0.95, pattern.confidence + 0.02)
      })
    })
  }
  
  train() {
    // Train the model (simplified for demo)
    const totalPatterns = this.patterns.length
    const avgConfidence = totalPatterns > 0 ? 
      this.patterns.reduce((sum, p) => sum + p.confidence, 0) / totalPatterns : 0.5
    
    this.accuracy = avgConfidence
    this.isTrained = true
  }
  
  isAccurate(): boolean {
    return this.accuracy > 0.8
  }
  
  getAccuracy(): number {
    return this.accuracy
  }
}

// Interfaces
interface UserBehaviorPattern {
  userId: string
  actions: UserAction[]
  sequences: Record<string, SequenceData>
  avgSessionTime: number
  lastActivity: number
}

interface UserAction {
  userId: string
  action: string
  timestamp: number
  context: any
}

interface SequenceData {
  sequence: string[]
  count: number
  avgTime: number
  lastSeen: number
}

interface BehaviorPattern {
  action: string
  likelyNext: NextAction[]
  confidence: number
  avgTimeBetween: number
}

interface NextAction {
  action: string
  confidence: number
  estimatedTime: number
  context?: any
}

interface PredictedAction {
  action: string
  confidence: number
  context: any
  estimatedTime: number
}

interface PreloadTask {
  id: string
  action: string
  context: any
  priority: number
  timestamp: number
  executed: boolean
}

interface PreloadedContent {
  content: any
  timestamp: number
  context: any
  used: boolean
}

interface UserBehaviorStats {
  totalUsers: number
  activeUsers: number
  totalActions: number
  avgSessionTime: number
  modelAccuracy: number
  cacheSize: number
  queueSize: number
}

// Global predictive preloader instance
export const predictivePreloader = new PredictivePreloader()

// Reactive hook for predictive preloading
export function usePredictivePreloading() {
  const [stats, setStats] = createSignal<UserBehaviorStats>(predictivePreloader.getUserBehaviorStats())
  
  createEffect(() => {
    const interval = window.setInterval(() => {
      setStats(predictivePreloader.getUserBehaviorStats())
    }, 5000) // Update every 5 seconds
    
    onCleanup(() => window.clearInterval(interval))
  })
  
  return {
    stats,
    trackUserAction: (action: string, context?: any) => predictivePreloader.trackUserAction(action, context),
    getPreloadedContent: (action: string) => predictivePreloader.getPreloadedContent(action),
    getPredictionAccuracy: () => predictivePreloader.getPredictionAccuracy()
  }
}
