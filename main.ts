import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';

interface BrightnessSettings {
	brightnessLevel: number; // -100 to 100, where 0 is no change
}

const DEFAULT_SETTINGS: BrightnessSettings = {
	brightnessLevel: 0
}

export default class DarkSlidePlugin extends Plugin {
	settings: BrightnessSettings;
	statusBarItem: HTMLElement;

	async onload() {
		await this.loadSettings();

		// Apply initial brightness
		this.applyBrightness();

		// Add status bar slider
		this.createStatusBarSlider();

		// Add settings tab
		this.addSettingTab(new BrightnessSettingTab(this.app, this));

		// Add ribbon icon for quick access
		this.addRibbonIcon('sun', 'Adjust Background Brightness', () => {
			// @ts-ignore
			this.app.setting.open();
			// @ts-ignore
			this.app.setting.openTabById('darkslide');
		});
	}

	onunload() {
		// Reset CSS variable on unload
		document.body.style.removeProperty('--darkslide-overlay');
	}

	createStatusBarSlider() {
		this.statusBarItem = this.addStatusBarItem();
		this.statusBarItem.addClass('brightness-status-bar');
		
		// Create container with icon and slider
		const container = this.statusBarItem.createEl('div', {
			cls: 'brightness-slider-container'
		});
		
		// Add sun icon
		const icon = container.createEl('span', {
			text: '☀️',
			cls: 'brightness-icon'
		});
		
		// Create slider
		const slider = container.createEl('input', {
			type: 'range',
			cls: 'brightness-slider'
		});
		slider.min = '-100';
		slider.max = '100';
		slider.step = '5';
		slider.value = this.settings.brightnessLevel.toString();
		
		// Add value display
		const valueDisplay = container.createEl('span', {
			text: `${this.settings.brightnessLevel}`,
			cls: 'brightness-value'
		});
		
		// Handle slider change
		slider.addEventListener('input', async (e) => {
			const value = parseInt((e.target as HTMLInputElement).value);
			this.settings.brightnessLevel = value;
			valueDisplay.setText(`${value}`);
			this.applyBrightness();
		});
		
		// Save on mouse up
		slider.addEventListener('mouseup', async () => {
			await this.saveSettings();
		});
		
		// Also save on touch end for mobile
		slider.addEventListener('touchend', async () => {
			await this.saveSettings();
		});
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.applyBrightness();
	}

	applyBrightness() {
		const brightness = this.settings.brightnessLevel;
		
		if (brightness !== 0) {
			// Calculate overlay color and opacity
			let overlayColor: string;
			let overlayOpacity: number;
			
			if (brightness < 0) {
				// Darker: black overlay
				overlayColor = '0, 0, 0';
				overlayOpacity = Math.abs(brightness) / 100;
			} else {
				// Brighter: white overlay
				overlayColor = '255, 255, 255';
				overlayOpacity = brightness / 100;
			}
			
			// Update CSS variable - styles.css will use this
			document.body.style.setProperty('--darkslide-overlay', `rgba(${overlayColor}, ${overlayOpacity})`);
		} else {
			// Reset to transparent
			document.body.style.setProperty('--darkslide-overlay', 'rgba(0, 0, 0, 0)');
		}
	}
}

class BrightnessSettingTab extends PluginSettingTab {
	plugin: DarkSlidePlugin;

	constructor(app: App, plugin: DarkSlidePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'DarkSlide'});

		containerEl.createEl('p', {
			text: 'Adjust the brightness of background colors in your current theme. Negative values make it darker, positive values make it brighter.',
			cls: 'setting-item-description'
		});

		// Create a div to show the current brightness value
		const valueDisplay = containerEl.createEl('div', {
			text: `Current brightness: ${this.plugin.settings.brightnessLevel}%`,
			cls: 'brightness-value-display'
		});

		new Setting(containerEl)
			.setName('Brightness Level')
			.setDesc('Adjust background brightness (-100 = darkest, 0 = normal, +100 = brightest)')
			.addSlider(slider => slider
				.setLimits(-100, 100, 5)
				.setValue(this.plugin.settings.brightnessLevel)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.brightnessLevel = value;
					await this.plugin.saveSettings();
					valueDisplay.setText(`Current brightness: ${value}%`);
				}));

		// Add a reset button
		new Setting(containerEl)
			.setName('Reset to Default')
			.setDesc('Reset brightness to 0 (no change)')
			.addButton(button => button
				.setButtonText('Reset')
				.onClick(async () => {
					this.plugin.settings.brightnessLevel = 0;
					await this.plugin.saveSettings();
					this.display(); // Refresh the settings tab
				}));

		// Add some helpful tips
		containerEl.createEl('h3', {text: 'Tips'});
		const tipsList = containerEl.createEl('ul');
		tipsList.createEl('li', {text: 'Use negative values (-50 to -100) to make dark themes darker'});
		tipsList.createEl('li', {text: 'Use positive values (+20 to +50) to brighten overly dark themes'});
		tipsList.createEl('li', {text: 'Changes are applied immediately as you move the slider'});
		tipsList.createEl('li', {text: 'Settings are saved per vault'});
	}
}