const invariant = require('invariant');
const CACHED_STATES = {};

function generateRouteName(components) {
  return `Nested_${
    components.map(component => component.displayName).join('_')
  }`;
}

function generateContainer(React, Relay, newProps) {
  const { branch, components } = newProps;
  const routeName = generateRouteName(components);

  if (CACHED_STATES[routeName]) {
    return CACHED_STATES[routeName];
  }

  const queries = {};
  const fragmentNames = [];
  let queryIdx = 0;

  const [, ...elems] = components.map((Component, index) => {
    const fragmentResolvers = [];

    if (Relay.isContainer(Component)) {
      const { route } = branch[index];

      invariant(
        route,
        'Routes with Relay.Containers must include a `route` prop.'
      );

      Object.keys(route.queries).forEach(queryName => {
        const newQueryName = `Nested_${route.name}_${queryName}_${++queryIdx}`;
        queries[newQueryName] =
          (_, ...args) => route.queries[queryName](Component, ...args);

        fragmentNames.push(newQueryName);
        fragmentResolvers.push({
          prop: queryName,
          resolve: function getLocalProp() {
            return this.props[newQueryName];
          }
        });
      });
    }

    return function ComponentGenerator(props) {
      fragmentResolvers.forEach(fragment => {
        props[fragment.prop] = fragment.resolve.call(this);
      });

      return <Component {...props}/>;
    };
  });

  class NestedRenderer extends React.Component {
    static getFragmentNames() {
      return fragmentNames;
    }

    // Hackishly satisfy isRelayContainer.
    static getQuery() {}
    static getQueryNames() {}

    render() {
      return elems.reduceRight((children, generateComponent) => {
        return generateComponent.call(this, { children: children });
      }, null);
    }
  }

  const route = {
    name: routeName,
    queries
  };

  const state = CACHED_STATES[routeName] = {
    Component: NestedRenderer,
    route
  };
  return state;
}

export default function generateRootContainer(React, Relay) {
  return class NestedRootContainer extends React.Component {
    constructor(props, context) {
      super(props, context);
      this.state = generateContainer(React, Relay, props);
    }

    componentWillReceiveProps(props) {
      this.setState(generateContainer(React, Relay, props));
    }

    render() {
      const { Component, route } = this.state;

      return (
        <Relay.RootContainer
          {...this.props}
          Component={Component}
          route={{ ...route, params: this.props.params }}/>
      );
    }
  };
}
