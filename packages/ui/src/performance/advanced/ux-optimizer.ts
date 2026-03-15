import { createSignal, createEffect, onCleanup } from "solid-js"
import { useProductionAnalytics } from "../safety/production-analytics"

// Advanced User Experience Optimizer for Phase 3
export class UXOptimizer {
  private userProfiles = new Map<string, UserProfile>()
  private experienceMetrics = new Map<string, ExperienceMetric>()
  private adaptationEngine = new UXAdaptationEngine()
  private personalizationEngine = new PersonalizationEngine()
  private isOptimizing = true
  private optimizationInterval: number | undefined
  
  constructor() {
    this.startUXOptimization()
    this.initializeUserProfiles()
    this.startAdaptationEngine()
  }
  
  private startUXOptimization() {
    // Optimize UX every 2 seconds
    this.optimizationInterval = window.setInterval(() => {
      this.optimizeUserExperience()
    }, 2000)
  }
  
  private initializeUserProfiles() {
    // Initialize user profiles for different segments
    this.userProfiles.set('power_user', {
      name: 'Power User',
      characteristics: {
        experienceLevel: 'expert',
        interactionFrequency: 'high',
        featureUsage: 'advanced',
        patienceLevel: 'low',
        technicalKnowledge: 'high'
      },
      preferences: {
        animations: 'minimal',
        shortcuts: 'enabled',
        tooltips: 'disabled',
        autoSave: 'frequent',
        notifications: 'minimal',
        complexity: 'high'
      }
    })
    
    this.userProfiles.set('casual_user', {
      name: 'Casual User',
      characteristics: {
        experienceLevel: 'intermediate',
        interactionFrequency: 'medium',
        featureUsage: 'basic',
        patienceLevel: 'medium',
        technicalKnowledge: 'medium'
      },
      preferences: {
        animations: 'smooth',
        shortcuts: 'disabled',
        tooltips: 'enabled',
        autoSave: 'normal',
        notifications: 'balanced',
        complexity: 'medium'
      }
    })
    
    this.userProfiles.set('new_user', {
      name: 'New User',
      characteristics: {
        experienceLevel: 'beginner',
        interactionFrequency: 'low',
        featureUsage: 'basic',
        patienceLevel: 'high',
        technicalKnowledge: 'low'
      },
      preferences: {
        animations: 'enhanced',
        shortcuts: 'disabled',
        tooltips: 'enabled',
        autoSave: 'frequent',
        notifications: 'helpful',
        complexity: 'low'
      }
    })
  }
  
  private startAdaptationEngine() {
    // Start continuous adaptation
    window.setInterval(() => {
      this.adaptToUserBehavior()
    }, 5000)
  }
  
  trackUserInteraction(interaction: UserInteraction) {
    const userId = this.getCurrentUserId()
    const timestamp = Date.now()
    
    // Record interaction
    const enrichedInteraction: EnrichedInteraction = {
      ...interaction,
      userId,
      timestamp,
      userProfile: this.classifyUser(userId),
      context: this.getContextualData(interaction)
    }
    
    // Update user behavior patterns
    this.updateUserBehavior(enrichedInteraction)
    
    // Trigger immediate optimization if needed
    this.triggerImmediateOptimization(enrichedInteraction)
  }
  
  private classifyUser(userId: string): UserProfile {
    // Get user behavior data
    const behavior = this.getUserBehavior(userId)
    
    // Calculate user characteristics
    const characteristics = this.calculateUserCharacteristics(behavior)
    
    // Find best matching profile
    let bestProfile = this.userProfiles.get('casual_user')!
    let bestScore = 0
    
    this.userProfiles.forEach(profile => {
      const score = this.calculateProfileMatch(characteristics, profile.characteristics)
      if (score > bestScore) {
        bestScore = score
        bestProfile = profile
      }
    })
    
    return bestProfile
  }
  
  private getUserBehavior(userId: string): UserBehavior {
    // Get user behavior from storage
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(`user-behavior-${userId}`)
      return stored ? JSON.parse(stored) : {
        interactions: [],
        sessionDuration: 0,
        featureUsage: {},
        errorCount: 0,
        helpRequests: 0
      }
    }
    
    return {
      interactions: [],
      sessionDuration: 0,
      featureUsage: {},
      errorCount: 0,
      helpRequests: 0
    }
  }
  
  private calculateUserCharacteristics(behavior: UserBehavior): UserCharacteristics {
    const interactions = behavior.interactions
    const sessionDuration = behavior.sessionDuration
    
    // Calculate experience level
    const experienceLevel = this.calculateExperienceLevel(interactions, behavior.featureUsage)
    
    // Calculate interaction frequency
    const interactionFrequency = sessionDuration > 0 ? interactions.length / (sessionDuration / 60000) : 0
    const frequencyLevel = interactionFrequency > 10 ? 'high' : interactionFrequency > 5 ? 'medium' : 'low'
    
    // Calculate feature usage
    const featureUsage = Object.keys(behavior.featureUsage).length
    const usageLevel = featureUsage > 8 ? 'advanced' : featureUsage > 4 ? 'basic' : 'minimal'
    
    // Calculate patience level (based on error rate and help requests)
    const errorRate = interactions.length > 0 ? behavior.errorCount / interactions.length : 0
    const helpRate = interactions.length > 0 ? behavior.helpRequests / interactions.length : 0
    const patienceScore = 1 - (errorRate + helpRate)
    const patienceLevel = patienceScore > 0.8 ? 'high' : patienceScore > 0.5 ? 'medium' : 'low'
    
    // Calculate technical knowledge
    const technicalScore = this.calculateTechnicalKnowledge(interactions, behavior.featureUsage)
    const technicalLevel = technicalScore > 0.8 ? 'high' : technicalScore > 0.5 ? 'medium' : 'low'
    
    return {
      experienceLevel,
      interactionFrequency: frequencyLevel,
      featureUsage: usageLevel,
      patienceLevel,
      technicalKnowledge: technicalLevel
    }
  }
  
  private calculateExperienceLevel(interactions: UserInteraction[], featureUsage: Record<string, number>): 'beginner' | 'intermediate' | 'expert' {
    const uniqueFeatures = Object.keys(featureUsage).length
    const totalInteractions = interactions.length
    
    if (totalInteractions < 10 || uniqueFeatures < 3) return 'beginner'
    if (totalInteractions < 50 || uniqueFeatures < 6) return 'intermediate'
    return 'expert'
  }
  
  private calculateTechnicalKnowledge(interactions: UserInteraction[], featureUsage: Record<string, number>): number {
    // Analyze usage of advanced features
    const advancedFeatures = ['keyboard_shortcuts', 'advanced_settings', 'debug_mode', 'customization']
    const advancedUsage = advancedFeatures.filter(feature => featureUsage[feature] > 0).length
    
    // Analyze interaction patterns
    const efficientPatterns = interactions.filter(i => 
      i.type === 'keyboard_shortcut' || 
      i.type === 'power_user_action'
    ).length
    
    const score = (advancedUsage / advancedFeatures.length) * 0.6 + 
                 (efficientPatterns / interactions.length) * 0.4
    
    return Math.min(1, Math.max(0, score))
  }
  
  private calculateProfileMatch(characteristics: UserCharacteristics, profileCharacteristics: UserCharacteristics): number {
    let score = 0
    let total = 0
    
    const fields: (keyof UserCharacteristics)[] = [
      'experienceLevel', 'interactionFrequency', 'featureUsage', 
      'patienceLevel', 'technicalKnowledge'
    ]
    
    fields.forEach(field => {
      total++
      if (characteristics[field] === profileCharacteristics[field]) {
        score++
      }
    })
    
    return total > 0 ? score / total : 0
  }
  
  private updateUserBehavior(interaction: EnrichedInteraction) {
    const userId = interaction.userId
    let behavior = this.getUserBehavior(userId)
    
    // Add interaction
    behavior.interactions.push({
      type: interaction.type,
      timestamp: interaction.timestamp,
      duration: interaction.duration || 0,
      success: interaction.success !== false
    })
    
    // Keep only last 100 interactions
    if (behavior.interactions.length > 100) {
      behavior.interactions.shift()
    }
    
    // Update feature usage
    if (interaction.feature) {
      behavior.featureUsage[interaction.feature] = (behavior.featureUsage[interaction.feature] || 0) + 1
    }
    
    // Update error count
    if (interaction.success === false) {
      behavior.errorCount++
    }
    
    // Update help requests
    if (interaction.type === 'help_request') {
      behavior.helpRequests++
    }
    
    // Update session duration
    behavior.sessionDuration = Date.now() - (behavior.interactions[0]?.timestamp || Date.now())
    
    // Save updated behavior
    if (typeof window !== 'undefined') {
      localStorage.setItem(`user-behavior-${userId}`, JSON.stringify(behavior))
    }
  }
  
  private getContextualData(interaction: UserInteraction): ContextualData {
    return {
      timeOfDay: new Date().getHours(),
      dayOfWeek: new Date().getDay(),
      deviceType: this.getDeviceType(),
      browserType: this.getBrowserType(),
      screenSize: this.getScreenSize(),
      networkSpeed: this.getNetworkSpeed(),
      batteryLevel: this.getBatteryLevel(),
      previousAction: this.getPreviousAction(),
      sessionLength: this.getSessionLength()
    }
  }
  
  private getDeviceType(): 'mobile' | 'tablet' | 'desktop' {
    const width = window.innerWidth
    if (width < 768) return 'mobile'
    if (width < 1024) return 'tablet'
    return 'desktop'
  }
  
  private getBrowserType(): string {
    return navigator.userAgent.split(' ')[0] || 'unknown'
  }
  
  private getScreenSize(): string {
    return `${window.screen.width}x${window.screen.height}`
  }
  
  private getNetworkSpeed(): string {
    return (navigator as any).connection?.effectiveType || 'unknown'
  }
  
  private getBatteryLevel(): number {
    return (navigator as any).battery?.level * 100 || 100
  }
  
  private getPreviousAction(): string {
    // Get previous action from behavior
    const userId = this.getCurrentUserId()
    const behavior = this.getUserBehavior(userId)
    const lastInteraction = behavior.interactions[behavior.interactions.length - 2]
    return lastInteraction?.type || 'none'
  }
  
  private getSessionLength(): number {
    const userId = this.getCurrentUserId()
    const behavior = this.getUserBehavior(userId)
    return behavior.sessionDuration
  }
  
  private triggerImmediateOptimization(interaction: EnrichedInteraction) {
    // Trigger optimization for specific interactions
    if (interaction.type === 'error' || interaction.success === false) {
      this.optimizeForErrorRecovery(interaction)
    } else if (interaction.type === 'help_request') {
      this.optimizeForHelp(interaction)
    } else if (interaction.duration && interaction.duration > 5000) {
      this.optimizeForSlowInteraction(interaction)
    }
  }
  
  private optimizeForErrorRecovery(interaction: EnrichedInteraction) {
    console.log(`🔧 Optimizing for error recovery: ${interaction.type}`)
    
    // Enable help features
    this.setUXPreference('tooltips', 'enabled')
    this.setUXPreference('notifications', 'helpful')
    
    // Simplify interface
    this.setUXPreference('complexity', 'low')
    
    // Add error recovery assistance
    this.triggerErrorRecoveryAssistance(interaction)
  }
  
  private optimizeForHelp(interaction: EnrichedInteraction) {
    console.log(`💡 Optimizing for help: ${interaction.feature}`)
    
    // Enable contextual help
    this.setUXPreference('tooltips', 'enabled')
    this.setUXPreference('notifications', 'helpful')
    
    // Provide guided assistance
    this.triggerGuidedAssistance(interaction)
  }
  
  private optimizeForSlowInteraction(interaction: EnrichedInteraction) {
    console.log(`⚡ Optimizing for slow interaction: ${interaction.type}`)
    
    // Optimize performance
    this.setUXPreference('animations', 'minimal')
    
    // Provide loading feedback
    this.triggerLoadingOptimization(interaction)
  }
  
  private optimizeUserExperience() {
    if (!this.isOptimizing) return
    
    const userId = this.getCurrentUserId()
    const userProfile = this.classifyUser(userId)
    const currentMetrics = this.getCurrentExperienceMetrics()
    
    // Generate optimization recommendations
    const recommendations = this.adaptationEngine.generateRecommendations(userProfile, currentMetrics)
    
    // Apply optimizations
    this.applyUXOptimizations(recommendations)
    
    // Update experience metrics
    this.updateExperienceMetrics(recommendations)
  }
  
  private getCurrentExperienceMetrics(): ExperienceMetrics {
    return {
      responseTime: this.getAverageResponseTime(),
      errorRate: this.getCurrentErrorRate(),
      taskCompletionRate: this.getTaskCompletionRate(),
      userSatisfaction: this.getUserSatisfaction(),
      engagementLevel: this.getEngagementLevel(),
      learningProgress: this.getLearningProgress()
    }
  }
  
  private getAverageResponseTime(): number {
    // Calculate average response time from recent interactions
    const userId = this.getCurrentUserId()
    const behavior = this.getUserBehavior(userId)
    const recentInteractions = behavior.interactions.slice(-10)
    
    if (recentInteractions.length === 0) return 200
    
    const totalTime = recentInteractions.reduce((sum, interaction) => sum + (interaction.duration || 200), 0)
    return totalTime / recentInteractions.length
  }
  
  private getCurrentErrorRate(): number {
    const userId = this.getCurrentUserId()
    const behavior = this.getUserBehavior(userId)
    
    if (behavior.interactions.length === 0) return 0
    
    return (behavior.errorCount / behavior.interactions.length) * 100
  }
  
  private getTaskCompletionRate(): number {
    // Simulate task completion rate
    return 85 + Math.random() * 15
  }
  
  private getUserSatisfaction(): number {
    // Simulate user satisfaction
    return 75 + Math.random() * 20
  }
  
  private getEngagementLevel(): number {
    const userId = this.getCurrentUserId()
    const behavior = this.getUserBehavior(userId)
    
    // Calculate engagement based on interaction frequency and session duration
    const interactionRate = behavior.interactions.length / (behavior.sessionDuration / 60000) || 0
    return Math.min(100, interactionRate * 10)
  }
  
  private getLearningProgress(): number {
    const userId = this.getCurrentUserId()
    const behavior = this.getUserBehavior(userId)
    
    // Calculate learning progress based on feature usage diversity
    const featureDiversity = Object.keys(behavior.featureUsage).length
    return Math.min(100, featureDiversity * 10)
  }
  
  private applyUXOptimizations(recommendations: UXOptimizationRecommendation[]) {
    recommendations.forEach(rec => {
      if (rec.confidence > 0.7) {
        console.log(`🎨 Applying UX optimization: ${rec.action} (confidence: ${rec.confidence})`)
        
        try {
          this.executeUXOptimization(rec)
        } catch (error) {
          console.error(`❌ UX optimization failed: ${rec.action}`, error)
        }
      }
    })
  }
  
  private executeUXOptimization(rec: UXOptimizationRecommendation) {
    switch (rec.action) {
      case 'enable_animations':
        this.setUXPreference('animations', 'smooth')
        break
      case 'disable_animations':
        this.setUXPreference('animations', 'minimal')
        break
      case 'enable_tooltips':
        this.setUXPreference('tooltips', 'enabled')
        break
      case 'disable_tooltips':
        this.setUXPreference('tooltips', 'disabled')
        break
      case 'enable_shortcuts':
        this.setUXPreference('shortcuts', 'enabled')
        break
      case 'disable_shortcuts':
        this.setUXPreference('shortcuts', 'disabled')
        break
      case 'increase_complexity':
        this.setUXPreference('complexity', 'high')
        break
      case 'decrease_complexity':
        this.setUXPreference('complexity', 'low')
        break
      case 'enable_notifications':
        this.setUXPreference('notifications', 'balanced')
        break
      case 'disable_notifications':
        this.setUXPreference('notifications', 'minimal')
        break
      case 'adjust_auto_save':
        this.setUXPreference('autoSave', rec.value || 'normal')
        break
    }
  }
  
  private setUXPreference(preference: string, value: string) {
    if (typeof window !== 'undefined') {
      const preferences = JSON.parse(localStorage.getItem('ux-preferences') || '{}')
      preferences[preference] = value
      localStorage.setItem('ux-preferences', JSON.stringify(preferences))
    }
  }
  
  private updateExperienceMetrics(recommendations: UXOptimizationRecommendation[]) {
    const timestamp = Date.now()
    
    recommendations.forEach(rec => {
      const key = `${rec.action}-${timestamp}`
      const metric: ExperienceMetric = {
        action: rec.action,
        confidence: rec.confidence,
        reason: rec.reason,
        timestamp,
        applied: true,
        impact: 'pending'
      }
      
      this.experienceMetrics.set(key, metric)
    })
  }
  
  private adaptToUserBehavior() {
    const userId = this.getCurrentUserId()
    const userProfile = this.classifyUser(userId)
    
    // Generate personalized adaptations
    const adaptations = this.personalizationEngine.generateAdaptations(userProfile)
    
    // Apply adaptations
    this.applyPersonalizedAdaptations(adaptations)
  }
  
  private applyPersonalizedAdaptations(adaptations: PersonalizedAdaptation[]) {
    adaptations.forEach(adaptation => {
      if (adaptation.confidence > 0.8) {
        console.log(`🎯 Applying personalized adaptation: ${adaptation.type}`)
        
        try {
          this.executePersonalizedAdaptation(adaptation)
        } catch (error) {
          console.error(`❌ Personalized adaptation failed: ${adaptation.type}`, error)
        }
      }
    })
  }
  
  private executePersonalizedAdaptation(adaptation: PersonalizedAdaptation) {
    switch (adaptation.type) {
      case 'layout_adjustment':
        this.adjustLayout(adaptation.settings)
        break
      case 'feature_highlighting':
        if (adaptation.features) {
          this.highlightFeatures(adaptation.features)
        }
        break
      case 'workflow_optimization':
        this.optimizeWorkflow(adaptation.workflow)
        break
      case 'content_personalization':
        this.personalizeContent(adaptation.content)
        break
    }
  }
  
  private adjustLayout(settings: any) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('ux-layout-adjustment', JSON.stringify(settings))
    }
  }
  
  private highlightFeatures(features: string[]) {
    if (typeof window !== 'undefined' && features) {
      localStorage.setItem('ux-featured-highlights', JSON.stringify(features))
    }
  }
  
  private optimizeWorkflow(workflow: any) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('ux-workflow-optimization', JSON.stringify(workflow))
    }
  }
  
  private personalizeContent(content: any) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('ux-content-personalization', JSON.stringify(content))
    }
  }
  
  private triggerErrorRecoveryAssistance(interaction: EnrichedInteraction) {
    console.log(`🆘 Triggering error recovery assistance for: ${interaction.type}`)
  }
  
  private triggerGuidedAssistance(interaction: EnrichedInteraction) {
    console.log(`👥 Triggering guided assistance for: ${interaction.feature}`)
  }
  
  private triggerLoadingOptimization(interaction: EnrichedInteraction) {
    console.log(`⏳ Triggering loading optimization for: ${interaction.type}`)
  }
  
  private getCurrentUserId(): string {
    if (typeof window !== 'undefined') {
      let userId = localStorage.getItem('ux-optimizer-user')
      if (!userId) {
        userId = Math.random().toString(36).substring(7)
        localStorage.setItem('ux-optimizer-user', userId)
      }
      return userId
    }
    return 'anonymous'
  }
  
  // Public API
  getUXOptimizationStatus(): UXOptimizationStatus {
    const userId = this.getCurrentUserId()
    const userProfile = this.classifyUser(userId)
    const currentMetrics = this.getCurrentExperienceMetrics()
    
    return {
      userProfile: userProfile.name,
      userCharacteristics: this.calculateUserCharacteristics(this.getUserBehavior(userId)),
      currentMetrics,
      optimizationsApplied: this.experienceMetrics.size,
      lastOptimization: this.getLastOptimizationTime(),
      personalizationActive: this.isOptimizing
    }
  }
  
  private getLastOptimizationTime(): number {
    const metrics = Array.from(this.experienceMetrics.values())
    const times = metrics.map(m => m.timestamp)
    return times.length > 0 ? Math.max(...times) : 0
  }
  
  getOptimizationHistory(): ExperienceMetric[] {
    const metrics = Array.from(this.experienceMetrics.values())
    return metrics.sort((a, b) => b.timestamp - a.timestamp).slice(0, 20) // Last 20 optimizations
  }
  
  manualUXOptimization(action: string, value?: any) {
    const rec: UXOptimizationRecommendation = {
      action,
      confidence: 1.0,
      reason: 'Manual UX optimization',
      value,
      impact: 'high'
    }
    
    this.executeUXOptimization(rec)
    
    // Track manual optimization
    const metric: ExperienceMetric = {
      action,
      confidence: 1.0,
      reason: 'Manual UX optimization',
      timestamp: Date.now(),
      applied: true,
      impact: 'pending'
    }
    
    this.experienceMetrics.set(`${action}-${Date.now()}`, metric)
  }
  
  cleanup() {
    if (this.optimizationInterval) {
      window.clearInterval(this.optimizationInterval)
    }
    
    this.userProfiles.clear()
    this.experienceMetrics.clear()
  }
}

// UX Adaptation Engine
class UXAdaptationEngine {
  generateRecommendations(profile: UserProfile, metrics: ExperienceMetrics): UXOptimizationRecommendation[] {
    const recommendations: UXOptimizationRecommendation[] = []
    
    // Analyze user profile and metrics to generate recommendations
    if (profile.characteristics.experienceLevel === 'beginner') {
      recommendations.push({
        action: 'enable_tooltips',
        confidence: 0.9,
        reason: 'Beginner user needs guidance',
        impact: 'high'
      })
      
      recommendations.push({
        action: 'decrease_complexity',
        confidence: 0.8,
        reason: 'Simplify interface for beginners',
        impact: 'medium'
      })
    }
    
    if (metrics.responseTime > 300) {
      recommendations.push({
        action: 'disable_animations',
        confidence: 0.7,
        reason: 'Slow response time detected',
        impact: 'medium'
      })
    }
    
    if (metrics.errorRate > 10) {
      recommendations.push({
        action: 'enable_tooltips',
        confidence: 0.8,
        reason: 'High error rate indicates need for help',
        impact: 'high'
      })
    }
    
    if (profile.characteristics.patienceLevel === 'low') {
      recommendations.push({
        action: 'disable_animations',
        confidence: 0.8,
        reason: 'Impatient user prefers faster interactions',
        impact: 'medium'
      })
    }
    
    return recommendations
  }
}

// Personalization Engine
class PersonalizationEngine {
  generateAdaptations(profile: UserProfile): PersonalizedAdaptation[] {
    const adaptations: PersonalizedAdaptation[] = []
    
    // Generate personalized adaptations based on user profile
    if (profile.characteristics.experienceLevel === 'expert') {
      adaptations.push({
        type: 'workflow_optimization',
        confidence: 0.9,
        workflow: {
          shortcuts: 'enabled',
          advancedFeatures: 'highlighted',
          minimalGuidance: true
        }
      })
    }
    
    if (profile.characteristics.interactionFrequency === 'high') {
      adaptations.push({
        type: 'feature_highlighting',
        confidence: 0.8,
        features: ['keyboard_shortcuts', 'batch_operations']
      })
    }
    
    return adaptations
  }
}

// Interfaces
interface UserProfile {
  name: string
  characteristics: UserCharacteristics
  preferences: UXPreferences
}

interface UserCharacteristics {
  experienceLevel: 'beginner' | 'intermediate' | 'expert'
  interactionFrequency: 'low' | 'medium' | 'high'
  featureUsage: 'minimal' | 'basic' | 'advanced'
  patienceLevel: 'low' | 'medium' | 'high'
  technicalKnowledge: 'low' | 'medium' | 'high'
}

interface UXPreferences {
  animations: 'minimal' | 'smooth' | 'enhanced'
  shortcuts: 'enabled' | 'disabled'
  tooltips: 'enabled' | 'disabled'
  autoSave: 'frequent' | 'normal' | 'rare'
  notifications: 'minimal' | 'balanced' | 'helpful'
  complexity: 'low' | 'medium' | 'high'
}

interface UserInteraction {
  type: string
  feature?: string
  duration?: number
  success?: boolean
  context?: any
}

interface EnrichedInteraction extends UserInteraction {
  userId: string
  timestamp: number
  userProfile: UserProfile
  context: ContextualData
}

interface ContextualData {
  timeOfDay: number
  dayOfWeek: number
  deviceType: 'mobile' | 'tablet' | 'desktop'
  browserType: string
  screenSize: string
  networkSpeed: string
  batteryLevel: number
  previousAction: string
  sessionLength: number
}

interface UserBehavior {
  interactions: Array<{
    type: string
    timestamp: number
    duration: number
    success: boolean
  }>
  sessionDuration: number
  featureUsage: Record<string, number>
  errorCount: number
  helpRequests: number
}

interface ExperienceMetrics {
  responseTime: number
  errorRate: number
  taskCompletionRate: number
  userSatisfaction: number
  engagementLevel: number
  learningProgress: number
}

interface UXOptimizationRecommendation {
  action: string
  confidence: number
  reason: string
  value?: any
  impact: 'low' | 'medium' | 'high'
}

interface ExperienceMetric {
  action: string
  confidence: number
  reason: string
  timestamp: number
  applied: boolean
  impact: 'pending' | 'success' | 'failure'
}

interface UXOptimizationStatus {
  userProfile: string
  userCharacteristics: UserCharacteristics
  currentMetrics: ExperienceMetrics
  optimizationsApplied: number
  lastOptimization: number
  personalizationActive: boolean
}

interface PersonalizedAdaptation {
  type: 'layout_adjustment' | 'feature_highlighting' | 'workflow_optimization' | 'content_personalization'
  confidence: number
  settings?: any
  features?: string[]
  workflow?: any
  content?: any
}

// Global UX optimizer instance
export const uxOptimizer = new UXOptimizer()

// Reactive hook for UX optimization
export function useUXOptimizer() {
  const [status, setStatus] = createSignal<UXOptimizationStatus>(uxOptimizer.getUXOptimizationStatus())
  const [history, setHistory] = createSignal<ExperienceMetric[]>(uxOptimizer.getOptimizationHistory())
  
  createEffect(() => {
    const interval = window.setInterval(() => {
      setStatus(uxOptimizer.getUXOptimizationStatus())
      setHistory(uxOptimizer.getOptimizationHistory())
    }, 3000) // Update every 3 seconds
    
    onCleanup(() => window.clearInterval(interval))
  })
  
  return {
    status,
    history,
    trackUserInteraction: (interaction: UserInteraction) => uxOptimizer.trackUserInteraction(interaction),
    manualUXOptimization: (action: string, value?: any) => uxOptimizer.manualUXOptimization(action, value),
    getUXOptimizationStatus: () => uxOptimizer.getUXOptimizationStatus()
  }
}
