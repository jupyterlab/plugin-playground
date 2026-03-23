import { LabIcon } from '@jupyterlab/ui-components';

import tokenSidebarIconSvgstr from '!!raw-loader!../style/icons/token-sidebar.svg';
import docsLinkIconSvgstr from '!!raw-loader!../style/icons/docs-link.svg';
import npmPackageIconSvgstr from '!!raw-loader!../style/icons/npm-package.svg';
import githubRepositoryIconSvgstr from '!!raw-loader!../style/icons/github-repository.svg';
import gitRepositoryIconSvgstr from '!!raw-loader!../style/icons/git-repository.svg';

export const tokenSidebarIcon = new LabIcon({
  name: 'plugin-playground:token-sidebar',
  svgstr: tokenSidebarIconSvgstr
});

export const docsLinkIcon = new LabIcon({
  name: 'plugin-playground:docs-link',
  svgstr: docsLinkIconSvgstr
});

export const npmPackageIcon = new LabIcon({
  name: 'plugin-playground:npm-package',
  svgstr: npmPackageIconSvgstr
});

export const githubRepositoryIcon = new LabIcon({
  name: 'plugin-playground:github-repository',
  svgstr: githubRepositoryIconSvgstr
});

export const gitRepositoryIcon = new LabIcon({
  name: 'plugin-playground:git-repository',
  svgstr: gitRepositoryIconSvgstr
});
