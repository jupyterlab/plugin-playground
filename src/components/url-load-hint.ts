export interface IFloatingUrlLoadHintOptions {
  parent: HTMLElement;
  title: string;
  description: string;
  closeAriaLabel: string;
  onClose: () => void;
}

export interface IFloatingUrlLoadHint {
  hide: () => void;
  setPosition: (left: number, top: number) => void;
  show: () => void;
  dispose: () => void;
}

export function createFloatingUrlLoadHint(
  options: IFloatingUrlLoadHintOptions
): IFloatingUrlLoadHint {
  const hintNode = document.createElement('div');
  hintNode.className =
    'jp-PluginPlayground-urlLoadedHintCard jp-PluginPlayground-urlLoadedFloatingHint';

  const titleNode = document.createElement('span');
  titleNode.className = 'jp-PluginPlayground-urlLoadedHintText';
  titleNode.textContent = options.title;

  const descriptionNode = document.createElement('span');
  descriptionNode.className = 'jp-PluginPlayground-urlLoadedHintDescription';
  descriptionNode.textContent = options.description;

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'jp-PluginPlayground-urlLoadedHintClose';
  closeButton.textContent = '×';
  closeButton.setAttribute('aria-label', options.closeAriaLabel);

  const onCloseButtonClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    options.onClose();
  };

  closeButton.addEventListener('click', onCloseButtonClick);
  hintNode.append(titleNode, descriptionNode, closeButton);
  hintNode.style.display = 'none';
  options.parent.appendChild(hintNode);

  return {
    hide: () => {
      hintNode.style.display = 'none';
    },
    setPosition: (left: number, top: number) => {
      hintNode.style.left = `${left}px`;
      hintNode.style.top = `${top}px`;
    },
    show: () => {
      hintNode.style.display = 'flex';
    },
    dispose: () => {
      closeButton.removeEventListener('click', onCloseButtonClick);
      hintNode.remove();
    }
  };
}
